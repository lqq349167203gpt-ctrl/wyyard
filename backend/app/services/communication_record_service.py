import uuid
from datetime import datetime
from typing import Dict, List, Optional

from app.services.storage import load_data, save_item
from app.models.communication_record import CommunicationRecord, CommunicationRecordCreate

FILENAME = "communication_records.json"
_records: Dict[str, CommunicationRecord] = {}


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {k: CommunicationRecord(**v) for k, v in data.items()}


_load()


def create_record(data: CommunicationRecordCreate, creator: str = "") -> CommunicationRecord:
    record = CommunicationRecord(
        id=str(uuid.uuid4())[:12],
        customer_nickname=data.customer_nickname,
        content=data.content,
        creator=creator,
        created_at=datetime.now(),
    )
    _records[record.id] = record
    save_item(FILENAME, record.id, record.model_dump(mode="json"))
    return record


def list_records() -> List[CommunicationRecord]:
    return sorted(_records.values(), key=lambda x: x.created_at, reverse=True)
