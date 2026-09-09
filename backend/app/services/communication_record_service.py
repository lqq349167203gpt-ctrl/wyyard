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
        customer_id=data.customer_id,
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
    return sorted((_current_customer_record(r) for r in _records.values()), key=lambda x: x.created_at, reverse=True)


def _current_customer_record(record: CommunicationRecord) -> CommunicationRecord:
    from app.services import customer_service

    customer = customer_service.get_customer(record.customer_id) if record.customer_id else None
    if customer:
        return record.model_copy(update={"customer_nickname": customer.nickname})
    return record


def bind_legacy_customer(customer_id: str, nickname: str) -> None:
    """改名前固定已有昵称记录的归属，不猜测已经改名的历史记录。"""
    for record_id, record in list(_records.items()):
        if not record.customer_id and record.customer_nickname == nickname:
            updated = record.model_copy(update={"customer_id": customer_id})
            save_item(FILENAME, record_id, updated.model_dump(mode="json"))
            _records[record_id] = updated


def get_record(record_id: str) -> Optional[CommunicationRecord]:
    record = _records.get(record_id)
    return _current_customer_record(record) if record else None


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
    updated = record.model_copy(update={
        "customer_id": data.customer_id,
        "customer_nickname": data.customer_nickname,
        "content": data.content,
    })
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
