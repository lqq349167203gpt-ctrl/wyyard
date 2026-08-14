import threading
import uuid
from datetime import datetime, timezone
from typing import TypeVar

from app.models.financial import (
    Commission,
    CommissionCreate,
    StaffBenefit,
    StaffBenefitCreate,
)
from app.services.storage import load_data, save_item

COMMISSIONS_FILE = "commission_records.json"
BENEFITS_FILE = "staff_benefits.json"

_commissions: dict[str, Commission] = {}
_benefits: dict[str, StaffBenefit] = {}
_lock = threading.Lock()


def _load() -> None:
    global _commissions, _benefits
    _commissions = {
        key: Commission(**value) for key, value in load_data(COMMISSIONS_FILE).items()
    }
    _benefits = {
        key: StaffBenefit(**value) for key, value in load_data(BENEFITS_FILE).items()
    }


_load()


def list_commissions(month: str = "") -> list[Commission]:
    items = [item for item in _commissions.values() if not item.is_deleted]
    if month:
        items = [item for item in items if item.month == month]
    return sorted(items, key=lambda item: (item.month, item.created_at), reverse=True)


def get_commission(record_id: str) -> Commission | None:
    item = _commissions.get(record_id)
    return item if item and not item.is_deleted else None


def create_commission(data: CommissionCreate, operator: str) -> Commission:
    with _lock:
        now = datetime.now(timezone.utc)
        item = Commission(
            id=str(uuid.uuid4()),
            **data.model_dump(),
            created_by=operator,
            updated_by=operator,
            created_at=now,
            updated_at=now,
        )
        _commissions[item.id] = item
        save_item(COMMISSIONS_FILE, item.id, item.model_dump(mode="json"))
        return item


def update_commission(record_id: str, data: CommissionCreate, operator: str) -> Commission:
    with _lock:
        item = get_commission(record_id)
        if not item:
            raise ValueError("分成记录不存在")
        updated = item.model_copy(update={
            **data.model_dump(),
            "updated_by": operator,
            "updated_at": datetime.now(timezone.utc),
        })
        _commissions[record_id] = updated
        save_item(COMMISSIONS_FILE, record_id, updated.model_dump(mode="json"))
        return updated


def list_benefits(date_from: str = "", date_to: str = "") -> list[StaffBenefit]:
    items = [item for item in _benefits.values() if not item.is_deleted]
    if date_from:
        items = [item for item in items if item.benefit_date >= date_from]
    if date_to:
        items = [item for item in items if item.benefit_date <= date_to]
    return sorted(items, key=lambda item: (item.benefit_date, item.created_at), reverse=True)


def get_benefit(record_id: str) -> StaffBenefit | None:
    item = _benefits.get(record_id)
    return item if item and not item.is_deleted else None


def create_benefit(data: StaffBenefitCreate, operator: str) -> StaffBenefit:
    with _lock:
        now = datetime.now(timezone.utc)
        item = StaffBenefit(
            id=str(uuid.uuid4()),
            **data.model_dump(),
            created_by=operator,
            updated_by=operator,
            created_at=now,
            updated_at=now,
        )
        _benefits[item.id] = item
        save_item(BENEFITS_FILE, item.id, item.model_dump(mode="json"))
        return item


def update_benefit(record_id: str, data: StaffBenefitCreate, operator: str) -> StaffBenefit:
    with _lock:
        item = get_benefit(record_id)
        if not item:
            raise ValueError("人员福利记录不存在")
        updated = item.model_copy(update={
            **data.model_dump(),
            "updated_by": operator,
            "updated_at": datetime.now(timezone.utc),
        })
        _benefits[record_id] = updated
        save_item(BENEFITS_FILE, record_id, updated.model_dump(mode="json"))
        return updated


RecordT = TypeVar("RecordT", Commission, StaffBenefit)


def _delete_record(records: dict[str, RecordT], filename: str, record_id: str, operator: str) -> None:
    with _lock:
        item = records.get(record_id)
        if not item or item.is_deleted:
            raise ValueError("记录不存在")
        now = datetime.now(timezone.utc)
        deleted = item.model_copy(update={
            "is_deleted": True,
            "updated_by": operator,
            "updated_at": now,
        })
        records[record_id] = deleted
        save_item(filename, record_id, deleted.model_dump(mode="json"))


def delete_commission(record_id: str, operator: str) -> None:
    _delete_record(_commissions, COMMISSIONS_FILE, record_id, operator)


def delete_benefit(record_id: str, operator: str) -> None:
    _delete_record(_benefits, BENEFITS_FILE, record_id, operator)
