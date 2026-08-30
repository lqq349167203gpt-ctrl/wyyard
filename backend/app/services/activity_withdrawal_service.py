"""课表五类活动共用的退课、恢复退课与历史查询。"""

import threading
import uuid
from datetime import datetime, timezone
from typing import Literal

from app.models.class_record import CourseWithdrawalEntry
from app.services import customer_service, membership_card_service

ActivityRecordType = Literal["class", "gcs", "ers", "eks", "ics"]

ACTIVITY_TYPE_LABELS: dict[ActivityRecordType, str] = {
    "class": "沙龙",
    "gcs": "觉醒游戏",
    "ers": "情绪释放",
    "eks": "能量结",
    "ics": "内部课程",
}

_withdrawal_lock = threading.RLock()


def _service(record_type: ActivityRecordType):
    from app.services import (
        class_record_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
    )

    services = {
        "class": class_record_service,
        "gcs": group_case_session_service,
        "ers": emotional_release_session_service,
        "eks": energy_knot_session_service,
        "ics": internal_course_session_service,
    }
    return services[record_type]


def get_record(record_type: ActivityRecordType, record_id: str):
    service = _service(record_type)
    getter = service.get_record if record_type == "class" else service.get_session
    return getter(record_id)


def _all_records(record_type: ActivityRecordType) -> list:
    service = _service(record_type)
    storage = service._records if record_type == "class" else service._sessions
    return list(storage.values())


def _registered_customer_ids(record_type: ActivityRecordType, record) -> set[str]:
    if record_type == "class":
        return set(_service(record_type)._get_registered_participant_ids(record))
    customer_ids = set(record.participant_ids or [])
    if record_type in {"gcs", "ers", "eks"} and record.owner_id:
        customer_ids.add(record.owner_id)
    return customer_ids


def _chargeable_customer_ids(record_type: ActivityRecordType, record) -> set[str]:
    service = _service(record_type)
    if record_type == "class":
        return set(service._get_group_member_ids(record))
    return set(service._get_chargeable_ids(record))


def _sync_deduction(record_type: ActivityRecordType, record, old_ids: set[str], new_ids: set[str]) -> None:
    _service(record_type)._sync_deduction(record, old_ids, new_ids)


def _save_record(record_type: ActivityRecordType, record) -> None:
    _service(record_type)._save(record.id)


def _refresh_customer(record_type: ActivityRecordType, customer_id: str) -> None:
    service = _service(record_type)
    refresh = getattr(service, "_refresh_affected_identities", None)
    if refresh:
        refresh({customer_id})
    from app.services import visit_service

    visit_service._invalidate_counts_cache()


def activity_name(record_type: ActivityRecordType, record) -> str:
    name = (
        getattr(record, "activity_name", "")
        or getattr(record, "name", "")
        or getattr(record, "course_name", "")
    )
    return name or ACTIVITY_TYPE_LABELS[record_type]


def _restored_count(record_type: ActivityRecordType, record, customer_id: str) -> int:
    arrived_ids = membership_card_service.filter_arrived_customer_ids(record.date, {customer_id})
    if customer_id not in arrived_ids:
        return 0
    if record_type == "class":
        if record.is_public_welfare:
            return 0
        return membership_card_service.get_activity_deduction_count(record)
    if record_type in {"gcs", "ers"}:
        if customer_id == record.owner_id:
            return 1
        if customer_id in set(record.participant_ids or []):
            return membership_card_service.get_activity_deduction_count(record)
        return 0
    if record_type == "eks" and customer_id == record.owner_id:
        return _service(record_type).get_session_deduction_count(record, customer_id)
    return 0


def _withdrawal_entry(
    record_type: ActivityRecordType,
    record,
    customer_id: str,
    operator_id: str,
    operator: str,
) -> CourseWithdrawalEntry:
    customer = customer_service.get_customer(customer_id)
    return CourseWithdrawalEntry(
        id=str(uuid.uuid4())[:12],
        record_type=record_type,
        customer_id=customer_id,
        customer_name=(customer.nickname or customer.name) if customer else "",
        activity_name=activity_name(record_type, record),
        course_type=(getattr(record, "course_type", "") or ACTIVITY_TYPE_LABELS[record_type]),
        course_date=record.date,
        start_time=record.start_time or "",
        end_time=record.end_time or "",
        space_name=record.space_name or "",
        room_name=record.room_name or "",
        restored_count=_restored_count(record_type, record, customer_id),
        withdrawn_at=datetime.now(timezone.utc),
        withdrawn_by_id=operator_id,
        withdrawn_by=operator,
    )


def withdraw_participant(
    record_type: ActivityRecordType,
    record_id: str,
    customer_id: str,
    operator_id: str = "",
    operator: str = "",
):
    if record_type == "class":
        result = _service(record_type).withdraw_participant(
            record_id, customer_id, operator_id, operator
        )
        if result[1]:
            from app.services import visit_service

            visit_service._invalidate_counts_cache()
        return result

    with _withdrawal_lock:
        record = get_record(record_type, record_id)
        if not record:
            return None, False
        if customer_id not in _registered_customer_ids(record_type, record):
            raise ValueError("所选客户不在该活动的参与名单中")
        if customer_id in set(record.withdrawn_participant_ids or []):
            return record, False

        old_chargeable = _chargeable_customer_ids(record_type, record)
        entry = _withdrawal_entry(record_type, record, customer_id, operator_id, operator)
        record.withdrawn_participant_ids = [*record.withdrawn_participant_ids, customer_id]
        record.withdrawal_records = [*record.withdrawal_records, entry]
        record.updated_at = datetime.now(timezone.utc)
        _save_record(record_type, record)
        new_chargeable = _chargeable_customer_ids(record_type, record)
        try:
            _sync_deduction(record_type, record, old_chargeable, new_chargeable)
        except Exception:
            record.withdrawn_participant_ids = [
                item for item in record.withdrawn_participant_ids if item != customer_id
            ]
            record.withdrawal_records = [
                item for item in record.withdrawal_records if item.id != entry.id
            ]
            record.updated_at = datetime.now(timezone.utc)
            _save_record(record_type, record)
            _sync_deduction(record_type, record, new_chargeable, old_chargeable)
            raise

    _refresh_customer(record_type, customer_id)
    return record, True


def cancel_withdrawal(
    record_type: ActivityRecordType,
    record_id: str,
    customer_id: str,
    operator_id: str = "",
    operator: str = "",
):
    if record_type == "class":
        result = _service(record_type).cancel_withdrawal(
            record_id, customer_id, operator_id, operator
        )
        if result[1]:
            from app.services import visit_service

            visit_service._invalidate_counts_cache()
        return result

    with _withdrawal_lock:
        record = get_record(record_type, record_id)
        if not record:
            return None, False
        if customer_id not in set(record.withdrawn_participant_ids or []):
            return record, False

        active_entry = next(
            (
                entry for entry in reversed(record.withdrawal_records)
                if entry.customer_id == customer_id and entry.status == "active"
            ),
            None,
        )
        old_chargeable = _chargeable_customer_ids(record_type, record)
        record.withdrawn_participant_ids = [
            item for item in record.withdrawn_participant_ids if item != customer_id
        ]
        now = datetime.now(timezone.utc)
        if active_entry:
            active_entry.status = "cancelled"
            active_entry.cancelled_at = now
            active_entry.cancelled_by_id = operator_id
            active_entry.cancelled_by = operator
        record.updated_at = now
        _save_record(record_type, record)
        new_chargeable = _chargeable_customer_ids(record_type, record)
        try:
            _sync_deduction(record_type, record, old_chargeable, new_chargeable)
        except Exception:
            record.withdrawn_participant_ids = [*record.withdrawn_participant_ids, customer_id]
            if active_entry:
                active_entry.status = "active"
                active_entry.cancelled_at = None
                active_entry.cancelled_by_id = ""
                active_entry.cancelled_by = ""
            record.updated_at = datetime.now(timezone.utc)
            _save_record(record_type, record)
            _sync_deduction(record_type, record, new_chargeable, old_chargeable)
            raise

    _refresh_customer(record_type, customer_id)
    return record, True


def list_withdrawals() -> list[dict]:
    result = []
    for item in _service("class").list_withdrawals():
        result.append({**item, "record_type": item.get("record_type") or "class"})

    for record_type in ("gcs", "ers", "eks", "ics"):
        for record in _all_records(record_type):
            for entry in record.withdrawal_records:
                result.append({
                    "id": entry.id,
                    "record_type": record_type,
                    "record_id": record.id,
                    "customer_id": entry.customer_id,
                    "customer_name": entry.customer_name,
                    "activity_name": entry.activity_name or activity_name(record_type, record),
                    "course_type": entry.course_type or ACTIVITY_TYPE_LABELS[record_type],
                    "course_date": entry.course_date or record.date,
                    "start_time": entry.start_time or record.start_time or "",
                    "end_time": entry.end_time or record.end_time or "",
                    "space_name": entry.space_name or record.space_name or "",
                    "room_name": entry.room_name or record.room_name or "",
                    "restored_count": entry.restored_count,
                    "status": entry.status,
                    "withdrawn_at": entry.withdrawn_at.isoformat(),
                    "withdrawn_by": entry.withdrawn_by or "",
                    "cancelled_at": entry.cancelled_at.isoformat() if entry.cancelled_at else None,
                    "cancelled_by": entry.cancelled_by or "",
                    "course_deleted": bool(record.is_deleted),
                })
    result.sort(key=lambda item: item["withdrawn_at"], reverse=True)
    return result
