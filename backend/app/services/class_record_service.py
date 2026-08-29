import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.class_record import ClassRecord, ClassRecordCreate, CourseWithdrawalEntry
from app.services import customer_service, membership_card_service
from app.services.storage import load_data, save_data, save_item

FILENAME = "class_records.json"
_records: Dict[str, ClassRecord] = {}
_record_lock = threading.Lock()


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {}
    for k, v in data.items():
        _records[k] = ClassRecord(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _records.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _records.items()}
        save_data(FILENAME, data)


_load()


def _build_course_map() -> dict:
    from app.services.course_service import list_courses
    return {c.id: {"name": c.name, "type": getattr(c, "type", "")} for c in list_courses()}


def _fill_course_name(records: List[ClassRecord]) -> List[ClassRecord]:
    course_map = _build_course_map()
    for r in records:
        if r.course_id and r.course_id in course_map:
            if not r.activity_name:
                r.course_name = course_map[r.course_id]["name"]
            if not r.course_type:
                r.course_type = course_map[r.course_id]["type"]
    return records


def list_records(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[ClassRecord]:
    records = [v for v in _records.values() if not v.is_deleted]
    if date:
        records = [r for r in records if r.date == date]
    if start_date:
        records = [r for r in records if r.date >= start_date]
    if end_date:
        records = [r for r in records if r.date <= end_date]
    records.sort(key=lambda r: r.created_at, reverse=True)
    return _fill_course_name(records)


def get_record(record_id: str) -> Optional[ClassRecord]:
    record = _records.get(record_id)
    if record and record.is_deleted:
        return None
    return record


def _get_registered_participant_ids(record) -> set[str]:
    """返回课程中登记过的全部参与人；退课人员仍保留在名单内。"""
    ids = set(record.participant_ids)
    for g in record.groups:
        if g.leader_id:
            ids.add(g.leader_id)
        if g.deputy_id:
            ids.add(g.deputy_id)
        ids.update(g.member_ids)
    return ids - set(record.teacher_ids)


def _get_group_member_ids(record) -> set:
    """返回当前实际参与且需要参与扣卡计算的人员。"""
    ids = _get_registered_participant_ids(record)
    ids -= set(record.withdrawn_participant_ids or [])
    return ids


def _ensure_withdrawn_participants_retained(
    record: ClassRecord,
    participant_ids: List[str],
    groups=None,
) -> None:
    withdrawn_ids = set(record.withdrawn_participant_ids or [])
    if not withdrawn_ids:
        return
    registered_ids = set(participant_ids or [])
    for group in record.groups if groups is None else groups:
        if isinstance(group, dict):
            registered_ids.update(filter(None, [group.get("leader_id", ""), group.get("deputy_id", "")]))
            registered_ids.update(group.get("member_ids", []) or [])
        else:
            registered_ids.update(filter(None, [group.leader_id, group.deputy_id]))
            registered_ids.update(group.member_ids or [])
    if not withdrawn_ids.issubset(registered_ids):
        raise ValueError("已退课人员必须保留在参与人名单中，不能直接取消")


def _deduct_for_record(record):
    """为新创建的沙龙活动扣费（公益类不扣费）"""
    if record.is_public_welfare:
        return
    chargeable = membership_card_service.filter_arrived_customer_ids(
        record.date,
        _get_group_member_ids(record),
    )
    activity_key = f"class:{record.id}"
    deduction_count = membership_card_service.get_activity_deduction_count(record)
    with membership_card_service._deduct_lock:
        for cid in chargeable:
            membership_card_service._do_sync_activity_count(cid, activity_key, deduction_count)
        membership_card_service._save_customer_usages(chargeable)


def _restore_for_record(record):
    """为删除的沙龙活动退费"""
    chargeable = _get_group_member_ids(record)
    activity_key = f"class:{record.id}"
    with membership_card_service._deduct_lock:
        for cid in chargeable:
            membership_card_service._do_sync_activity_count(cid, activity_key, 0)
        membership_card_service._save_customer_usages(chargeable)


def _sync_deduction(record, old_chargeable, new_chargeable):
    """同步参与人员、公益状态和单场扣卡次数。"""
    old_chargeable = membership_card_service.filter_arrived_customer_ids(record.date, old_chargeable)
    new_chargeable = membership_card_service.filter_arrived_customer_ids(record.date, new_chargeable)
    activity_key = f"class:{record.id}"
    deduction_count = (
        0
        if record.is_public_welfare
        else membership_card_service.get_activity_deduction_count(record)
    )
    with membership_card_service._deduct_lock:
        affected_ids = old_chargeable | new_chargeable
        for cid in affected_ids:
            target_count = deduction_count if cid in new_chargeable else 0
            membership_card_service._do_sync_activity_count(cid, activity_key, target_count)
        membership_card_service._save_customer_usages(affected_ids)


def _refresh_affected_identities(customer_ids: set):
    """刷新受影响客户的会员身份"""
    from app.services.member_identity_service import refresh_member_type
    for cid in customer_ids:
        if cid:
            try:
                refresh_member_type(cid)
            except Exception:
                pass


def _get_all_member_ids(record) -> set:
    """获取记录中所有相关人员 ID（参与者 + 老师 + 分组成员）"""
    ids = set(record.participant_ids or [])
    ids.update(record.teacher_ids or [])
    for g in record.groups:
        if g.leader_id:
            ids.add(g.leader_id)
        if g.deputy_id:
            ids.add(g.deputy_id)
        ids.update(g.member_ids or [])
    return ids


def create_record(data: ClassRecordCreate, refresh_identities: bool = True) -> ClassRecord:
    now = datetime.now(timezone.utc)
    record = ClassRecord(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _records[record.id] = record
    _save(record.id)
    _deduct_for_record(record)
    if refresh_identities:
        _refresh_affected_identities(_get_all_member_ids(record))
    return record


def update_record(
    record_id: str,
    data: dict,
    refresh_identities: bool = True,
    sync_deductions: bool = True,
) -> Optional[ClassRecord]:
    with _record_lock:
        record = _records.get(record_id)
        if not record or record.is_deleted:
            return None

        # 获取旧状态
        old_chargeable = _get_group_member_ids(record)

        if "participant_ids" in data or "groups" in data:
            _ensure_withdrawn_participants_retained(
                record,
                data.get("participant_ids", record.participant_ids) or [],
                data.get("groups", record.groups),
            )

        for key, value in data.items():
            if hasattr(record, key) and key not in (
                "id",
                "created_at",
                "created_by_id",
                "created_by",
                "withdrawn_participant_ids",
                "is_deleted",
                "deleted_at",
            ):
                setattr(record, key, value)
        record.membership_deduction_count = (
            0
            if record.is_public_welfare
            else max(1, int(record.membership_deduction_count or 1))
        )
        record.updated_at = datetime.now(timezone.utc)
        _records[record_id] = record
        _save(record_id)

        new_chargeable = _get_group_member_ids(record)
        if sync_deductions:
            _sync_deduction(record, old_chargeable, new_chargeable)

        # 刷新所有受影响客户的会员身份（旧参与者 + 新参与者）
        if refresh_identities:
            _refresh_affected_identities(old_chargeable | _get_all_member_ids(record))
        return record


def update_participants(record_id: str, participant_ids: List[str]):
    """返回 (record, []) 成功, (None, []) 未找到"""
    record = _records.get(record_id)
    if not record or record.is_deleted:
        return None, []
    _ensure_withdrawn_participants_retained(record, participant_ids)
    old_chargeable = _get_group_member_ids(record)
    old_ids = _get_all_member_ids(record)
    record.participant_ids = participant_ids
    new_chargeable = _get_group_member_ids(record)
    _sync_deduction(record, old_chargeable, new_chargeable)
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save(record_id)
    _refresh_affected_identities(old_ids | _get_all_member_ids(record))
    return record, []


def delete_record(record_id: str, refresh_identities: bool = True) -> bool:
    record = _records.get(record_id)
    if not record or record.is_deleted:
        return False
    affected_ids = _get_all_member_ids(record)
    _restore_for_record(record)
    record.is_deleted = True
    record.deleted_at = datetime.now(timezone.utc)
    _save(record_id)
    if refresh_identities:
        _refresh_affected_identities(affected_ids)
    return True


def update_groups(record_id: str, groups: list):
    """返回 (record, []) 成功, (None, []) 未找到"""
    from app.models.class_record import GroupMember
    from app.services import visit_service

    record = _records.get(record_id)
    if not record or record.is_deleted:
        return None, []

    _ensure_withdrawn_participants_retained(record, [], groups)

    # 校验成员必须在当日到场名单中，自动过滤已删除的人员
    visits = visit_service.list_visits(record.date)
    visit_ids = {v.customer_id for v in visits}

    all_member_ids = set()
    for g in groups:
        lid = g.get("leader_id", "")
        did = g.get("deputy_id", "")
        mids = g.get("member_ids", [])
        if lid and lid not in visit_ids:
            g["leader_id"] = ""
        elif lid:
            all_member_ids.add(lid)
        if did and did not in visit_ids:
            g["deputy_id"] = ""
        elif did:
            all_member_ids.add(did)
        valid_mids = [mid for mid in mids if mid in visit_ids]
        g["member_ids"] = valid_mids
        all_member_ids.update(valid_mids)

    old_ids = _get_all_member_ids(record)
    old_chargeable = _get_group_member_ids(record)
    record.participant_ids = list(all_member_ids)
    record.groups = [GroupMember(**g) for g in groups]
    new_chargeable = _get_group_member_ids(record)
    _sync_deduction(record, old_chargeable, new_chargeable)
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save(record_id)
    _refresh_affected_identities(old_ids | _get_all_member_ids(record))
    return record, []


def _withdrawal_restored_count(record: ClassRecord, customer_id: str) -> int:
    """返回办理退课时实际恢复的会员卡次数。"""
    if record.is_public_welfare:
        return 0
    arrived_ids = membership_card_service.filter_arrived_customer_ids(
        record.date,
        {customer_id},
    )
    if customer_id not in arrived_ids:
        return 0
    return membership_card_service.get_activity_deduction_count(record)


def _withdrawal_entry(
    record: ClassRecord,
    customer_id: str,
    *,
    entry_id: str,
    withdrawn_at: datetime,
    withdrawn_by_id: str = "",
    withdrawn_by: str = "",
) -> CourseWithdrawalEntry:
    customer = customer_service.get_customer(customer_id)
    return CourseWithdrawalEntry(
        id=entry_id,
        customer_id=customer_id,
        customer_name=(customer.nickname or customer.name) if customer else "",
        activity_name=record.activity_name or record.course_name or "未命名课程",
        course_type=record.course_type or "",
        course_date=record.date,
        start_time=record.start_time or "",
        end_time=record.end_time or "",
        space_name=record.space_name or "",
        room_name=record.room_name or "",
        restored_count=_withdrawal_restored_count(record, customer_id),
        withdrawn_at=withdrawn_at,
        withdrawn_by_id=withdrawn_by_id,
        withdrawn_by=withdrawn_by,
    )


def _ensure_legacy_withdrawal_records(record: ClassRecord) -> bool:
    """为旧版只有退课人员 ID 的数据补一条可展示的历史流水。"""
    changed = False
    for entry in record.withdrawal_records:
        customer = customer_service.get_customer(entry.customer_id)
        needs_customer_name = not entry.customer_name and customer is not None
        if entry.course_date and entry.activity_name and not needs_customer_name:
            continue
        snapshot = _withdrawal_entry(
            record,
            entry.customer_id,
            entry_id=entry.id,
            withdrawn_at=entry.withdrawn_at,
            withdrawn_by_id=entry.withdrawn_by_id,
            withdrawn_by=entry.withdrawn_by,
        )
        entry.customer_name = entry.customer_name or snapshot.customer_name
        entry.activity_name = entry.activity_name or snapshot.activity_name
        entry.course_type = entry.course_type or snapshot.course_type
        entry.course_date = entry.course_date or snapshot.course_date
        entry.start_time = entry.start_time or snapshot.start_time
        entry.end_time = entry.end_time or snapshot.end_time
        entry.space_name = entry.space_name or snapshot.space_name
        entry.room_name = entry.room_name or snapshot.room_name
        changed = True

    active_customer_ids = {
        entry.customer_id
        for entry in record.withdrawal_records
        if entry.status == "active"
    }
    for customer_id in record.withdrawn_participant_ids or []:
        if customer_id in active_customer_ids:
            continue
        record.withdrawal_records.append(_withdrawal_entry(
            record,
            customer_id,
            entry_id=f"legacy-{record.id}-{customer_id}",
            withdrawn_at=record.updated_at,
            # 旧数据没有保存办理人，不能用课程创建人冒充。
            withdrawn_by="历史记录",
        ))
        active_customer_ids.add(customer_id)
        changed = True
    return changed


def withdraw_participant(
    record_id: str,
    customer_id: str,
    operator_id: str = "",
    operator: str = "",
) -> tuple[Optional[ClassRecord], bool]:
    """办理退课：保留参与人历史，但停止该客户在本课程中的扣卡。"""
    with _record_lock:
        record = _records.get(record_id)
        if not record or record.is_deleted:
            return None, False
        if customer_id not in _get_registered_participant_ids(record):
            raise ValueError("所选客户不在该课程的参与人名单中")
        if customer_id in set(record.withdrawn_participant_ids or []):
            return record, False

        old_chargeable = _get_group_member_ids(record)
        withdrawal_entry = _withdrawal_entry(
            record,
            customer_id,
            entry_id=str(uuid.uuid4())[:12],
            withdrawn_at=datetime.now(timezone.utc),
            withdrawn_by_id=operator_id,
            withdrawn_by=operator,
        )
        record.withdrawn_participant_ids = [
            *record.withdrawn_participant_ids,
            customer_id,
        ]
        record.withdrawal_records = [*record.withdrawal_records, withdrawal_entry]
        new_chargeable = _get_group_member_ids(record)
        record.updated_at = datetime.now(timezone.utc)
        _records[record_id] = record
        _save(record_id)
        try:
            _sync_deduction(record, old_chargeable, new_chargeable)
        except Exception:
            record.withdrawn_participant_ids = [
                participant_id
                for participant_id in record.withdrawn_participant_ids
                if participant_id != customer_id
            ]
            record.withdrawal_records = [
                entry
                for entry in record.withdrawal_records
                if entry.id != withdrawal_entry.id
            ]
            record.updated_at = datetime.now(timezone.utc)
            _save(record_id)
            _sync_deduction(record, new_chargeable, old_chargeable)
            raise

    _refresh_affected_identities({customer_id})
    return record, True


def cancel_withdrawal(
    record_id: str,
    customer_id: str,
    operator_id: str = "",
    operator: str = "",
) -> tuple[Optional[ClassRecord], bool]:
    """取消退课：从退课名单移除该客户，恢复其在本课程中的扣卡。"""
    with _record_lock:
        record = _records.get(record_id)
        if not record or record.is_deleted:
            return None, False
        if customer_id not in set(record.withdrawn_participant_ids or []):
            return record, False

        _ensure_legacy_withdrawal_records(record)
        active_entry = next(
            (
                entry
                for entry in reversed(record.withdrawal_records)
                if entry.customer_id == customer_id and entry.status == "active"
            ),
            None,
        )
        old_chargeable = _get_group_member_ids(record)
        record.withdrawn_participant_ids = [
            participant_id
            for participant_id in record.withdrawn_participant_ids
            if participant_id != customer_id
        ]
        now = datetime.now(timezone.utc)
        if active_entry:
            active_entry.status = "cancelled"
            active_entry.cancelled_at = now
            active_entry.cancelled_by_id = operator_id
            active_entry.cancelled_by = operator
        new_chargeable = _get_group_member_ids(record)
        record.updated_at = now
        _records[record_id] = record
        _save(record_id)
        try:
            _sync_deduction(record, old_chargeable, new_chargeable)
        except Exception:
            record.withdrawn_participant_ids = [
                *record.withdrawn_participant_ids,
                customer_id,
            ]
            if active_entry:
                active_entry.status = "active"
                active_entry.cancelled_at = None
                active_entry.cancelled_by_id = ""
                active_entry.cancelled_by = ""
            record.updated_at = datetime.now(timezone.utc)
            _save(record_id)
            _sync_deduction(record, new_chargeable, old_chargeable)
            raise

    _refresh_affected_identities({customer_id})
    return record, True


def list_withdrawals() -> list[dict]:
    """返回全部退课历史；已取消记录仍保留。"""
    with _record_lock:
        records = list(_records.values())
    result = []
    for record in records:
        if _ensure_legacy_withdrawal_records(record):
            _save(record.id)
        for entry in record.withdrawal_records:
            result.append({
                "id": entry.id,
                "record_id": record.id,
                "customer_id": entry.customer_id,
                "customer_name": entry.customer_name,
                "activity_name": entry.activity_name or record.activity_name or record.course_name or "未命名课程",
                "course_type": entry.course_type or record.course_type or "",
                "course_date": entry.course_date or record.date,
                "start_time": entry.start_time,
                "end_time": entry.end_time,
                "space_name": entry.space_name,
                "room_name": entry.room_name,
                "restored_count": entry.restored_count,
                "status": entry.status,
                "withdrawn_at": entry.withdrawn_at.isoformat(),
                "withdrawn_by": entry.withdrawn_by or "",
                "cancelled_at": entry.cancelled_at.isoformat() if entry.cancelled_at else None,
                "cancelled_by": entry.cancelled_by or "",
                "course_deleted": record.is_deleted,
            })
    result.sort(key=lambda item: item["withdrawn_at"], reverse=True)
    return result


def _get_card_remaining(customer_id: str) -> int:
    """会员活动剩余次数：无卡=0，不限次=-1，有次数=具体数字"""
    cards = [c for c in membership_card_service.list_cards() if c.customer_id == customer_id]
    if not cards:
        return 0
    cards.sort(key=lambda c: c.created_at, reverse=True)
    return cards[0].remaining_count if cards[0].remaining_count is not None else -1


def search_customers(keyword: str) -> list:
    if not keyword:
        return []
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
                "remaining": _get_card_remaining(c.id),
            })
    return results


def rename_course_name(old_name: str, new_name: str) -> int:
    count = 0
    for record in _records.values():
        if record.course_name == old_name:
            record.course_name = new_name
            _save(record.id)
            count += 1
    return count


def rename_course_type(old_type: str, new_type: str) -> int:
    count = 0
    for record in _records.values():
        if record.course_type == old_type:
            record.course_type = new_type
            _save(record.id)
            count += 1
    return count
