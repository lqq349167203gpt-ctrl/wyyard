import uuid
from datetime import datetime
from typing import Dict, List, Optional

from app.services.storage import load_data, save_item, delete_item
from app.models.offline_course_record import OfflineCourseRecord, OfflineCourseRecordCreate

FILENAME = "offline_course_records.json"
_records: Dict[str, OfflineCourseRecord] = {}


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {k: OfflineCourseRecord(**v) for k, v in data.items()}


_load()


def list_records(customer_id: Optional[str] = None) -> List[OfflineCourseRecord]:
    records = list(_records.values())
    if customer_id:
        records = [r for r in records if r.customer_id == customer_id]
    return sorted(records, key=lambda x: x.created_at, reverse=True)


def get_record(record_id: str) -> Optional[OfflineCourseRecord]:
    return _records.get(record_id)


def create_record(data: OfflineCourseRecordCreate, creator: str = "") -> OfflineCourseRecord:
    record = OfflineCourseRecord(
        id=str(uuid.uuid4())[:12],
        customer_id=data.customer_id,
        customer_nickname=data.customer_nickname,
        record_date=data.record_date,
        teacher=data.teacher,
        content=data.content,
        result=data.result,
        creator=creator,
        created_at=datetime.now(),
    )
    _records[record.id] = record
    save_item(FILENAME, record.id, record.model_dump(mode="json"))
    return record


def update_record(record_id: str, data: OfflineCourseRecordCreate) -> Optional[OfflineCourseRecord]:
    record = _records.get(record_id)
    if not record:
        return None
    updated = record.model_copy(update={
        "customer_id": data.customer_id,
        "customer_nickname": data.customer_nickname,
        "record_date": data.record_date,
        "teacher": data.teacher,
        "content": data.content,
        "result": data.result,
        "updated_at": datetime.now(),
    })
    _records[record_id] = updated
    save_item(FILENAME, record_id, updated.model_dump(mode="json"))
    return updated


def delete_record(record_id: str) -> bool:
    if record_id not in _records:
        return False
    del _records[record_id]
    delete_item(FILENAME, record_id)
    return True
