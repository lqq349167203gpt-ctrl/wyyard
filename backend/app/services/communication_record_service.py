import uuid
from datetime import datetime
from typing import Dict, List, Optional

from app.models.communication_record import CommunicationRecord, CommunicationRecordCreate
from app.services.storage import load_data, save_item

FILENAME = "communication_records.json"
_records: Dict[str, CommunicationRecord] = {}


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {k: CommunicationRecord(**v) for k, v in data.items()}


_load()


def create_record(
    data: CommunicationRecordCreate,
    creator: str = "",
    creator_id: str = "",
) -> CommunicationRecord:
    record = CommunicationRecord(
        id=str(uuid.uuid4())[:12],
        customer_nickname=data.customer_nickname,
        content=data.content,
        creator=creator,
        creator_id=creator_id,
        created_at=datetime.now(),
    )
    _records[record.id] = record
    save_item(FILENAME, record.id, record.model_dump(mode="json"))
    return record


def list_records() -> List[CommunicationRecord]:
    return sorted(_records.values(), key=lambda x: x.created_at, reverse=True)


def get_record(record_id: str) -> Optional[CommunicationRecord]:
    return _records.get(record_id)


def can_manage_record(
    record: CommunicationRecord,
    account_id: str,
    owner_name: str = "",
    username: str = "",
) -> bool:
    """仅创建人可以修改或删除；旧数据没有 creator_id 时按原创建人名称兼容判断。"""
    if record.creator_id:
        return bool(account_id) and record.creator_id == account_id
    actor_names = {name for name in (owner_name, username) if name}
    return bool(record.creator) and record.creator in actor_names


def update_record(record_id: str, data: CommunicationRecordCreate) -> Optional[CommunicationRecord]:
    record = _records.get(record_id)
    if not record:
        return None
    updated = record.model_copy(update={"customer_nickname": data.customer_nickname, "content": data.content})
    _records[record_id] = updated
    save_item(FILENAME, record_id, updated.model_dump(mode="json"))
    return updated


def delete_record(record_id: str) -> bool:
    if record_id not in _records:
        return False
    del _records[record_id]
    from app.services.storage import delete_item
    delete_item(FILENAME, record_id)
    return True
