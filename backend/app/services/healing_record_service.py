import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.healing_record import HealingRecord, HealingRecordCreate, HealingRecordUpdate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "healing_records.json"
_records: Dict[str, HealingRecord] = {}


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {k: HealingRecord(**v) for k, v in data.items()}


def _save(record_id: str = ""):
    if record_id:
        item = _records.get(record_id)
        if item:
            save_item(FILENAME, record_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _records.items()}
        save_data(FILENAME, data)


_load()


def list_records(customer_id: Optional[str] = None) -> List[HealingRecord]:
    records = [v for v in _records.values() if not v.is_deleted]
    if customer_id:
        records = [r for r in records if r.customer_id == customer_id]
    records.sort(key=lambda r: (r.date, r.created_at), reverse=True)
    return records


def get_record(record_id: str) -> Optional[HealingRecord]:
    record = _records.get(record_id)
    if record and record.is_deleted:
        return None
    return record


def create_record(data: HealingRecordCreate) -> HealingRecord:
    now = datetime.now(timezone.utc)
    record = HealingRecord(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _records[record.id] = record
    _save(record.id)
    return record


def update_record(record_id: str, data: HealingRecordUpdate) -> Optional[HealingRecord]:
    record = _records.get(record_id)
    if not record:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("id", "created_at"):
            setattr(record, key, value)
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save(record_id)
    return record


def get_by_customer_date(customer_id: str, date: str) -> Optional[HealingRecord]:
    """获取某客户在某日期的第一条疗愈记录"""
    for r in _records.values():
        if r.customer_id == customer_id and r.date == date and not r.is_deleted:
            return r
    return None


def delete_record(record_id: str) -> bool:
    record = _records.get(record_id)
    if not record:
        return False
    record.is_deleted = True
    record.deleted_at = datetime.now(timezone.utc)
    _save(record_id)
    return True


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
            })
    return results
