import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.chat_history import ChatRecord, ChatRecordCreate
from app.services.storage import load_data, save_item

FILENAME = "chat_history.json"
_records: Dict[str, ChatRecord] = {}


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {}
    for k, v in data.items():
        _records[k] = ChatRecord(**v)


_load()


def save_message(data: ChatRecordCreate) -> ChatRecord:
    now = datetime.now(timezone.utc)
    record = ChatRecord(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        **data.model_dump(),
    )
    _records[record.id] = record
    save_item(FILENAME, record.id, record.model_dump(mode="json"))
    return record


def list_records(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    keyword: Optional[str] = None,
) -> List[ChatRecord]:
    records = list(_records.values())
    if user_id:
        records = [r for r in records if r.user_id == user_id]
    if keyword:
        kw = keyword.lower()
        records = [r for r in records if kw in r.content.lower()]
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            records = [r for r in records if r.created_at >= dt]
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            records = [r for r in records if r.created_at <= dt]
        except ValueError:
            pass
    return sorted(records, key=lambda x: x.created_at, reverse=True)
