import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.oh_card_reading import OhCardReading, OhCardReadingCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "oh_card_readings.json"
_readings: Dict[str, OhCardReading] = {}


def _migrate_closers(item: OhCardReading):
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]


def _load():
    global _readings
    data = load_data(FILENAME)
    _readings = {}
    for k, v in data.items():
        reading = OhCardReading(**v)
        _migrate_closers(reading)
        _readings[k] = reading


def _save(reading_id: str = ""):
    if reading_id:
        item = _readings.get(reading_id)
        if item:
            save_item(FILENAME, reading_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _readings.items()}
        save_data(FILENAME, data)


_load()


def list_readings() -> List[OhCardReading]:
    return [v for v in _readings.values() if not v.is_deleted]


def get_reading(reading_id: str) -> Optional[OhCardReading]:
    reading = _readings.get(reading_id)
    if reading and reading.is_deleted:
        return None
    return reading


def create_reading(data: OhCardReadingCreate) -> OhCardReading:
    now = datetime.now(timezone.utc)
    reading = OhCardReading(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _readings[reading.id] = reading
    _save(reading.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(reading.customer_id)
    return reading


def update_reading(reading_id: str, data: dict) -> Optional[OhCardReading]:
    reading = _readings.get(reading_id)
    if not reading:
        return None
    for key, value in data.items():
        if hasattr(reading, key) and key not in ("id", "created_at", "created_by"):
            setattr(reading, key, value)
    reading.updated_at = datetime.now(timezone.utc)
    _readings[reading_id] = reading
    _save(reading_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(reading.customer_id)
    return reading


def delete_reading(reading_id: str) -> tuple[bool, str]:
    reading = _readings.get(reading_id)
    if not reading:
        return False, "记录不存在"
    from app.services import oh_card_reading_session_service
    remaining = oh_card_reading_session_service.get_remaining_count(reading.customer_id)
    if remaining - reading.purchase_count < 0:
        return False, "该记录中有正在被使用的次数，无法删除"
    reading.is_deleted = True
    reading.deleted_at = datetime.now(timezone.utc)
    _save(reading_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(reading.customer_id)
    return True, "删除成功"


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
