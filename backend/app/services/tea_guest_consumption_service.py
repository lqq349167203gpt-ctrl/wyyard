import threading
import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from app.models.tea_guest_consumption import (
    TeaGuestConsumption,
    TeaGuestConsumptionCreate,
    TeaGuestConsumptionUpdate,
)
from app.services.storage import load_data, save_item

FILENAME = "tea_guest_consumption_records.json"

_records: dict[str, TeaGuestConsumption] = {}
_record_lock = threading.Lock()


def _load() -> None:
    global _records
    _records = {
        item_id: TeaGuestConsumption(**item)
        for item_id, item in load_data(FILENAME).items()
    }


_load()


def _calculate_total(guest_count: int, unit_price: float) -> float:
    total = Decimal(guest_count) * Decimal(str(unit_price))
    return float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def list_records(
    date_from: str = "",
    date_to: str = "",
    payment_method: str = "",
) -> list[TeaGuestConsumption]:
    items = [item for item in _records.values() if not item.is_deleted]
    if date_from:
        items = [item for item in items if item.consumption_time[:10] >= date_from]
    if date_to:
        items = [item for item in items if item.consumption_time[:10] <= date_to]
    if payment_method:
        items = [item for item in items if item.payment_method == payment_method]
    return sorted(items, key=lambda item: (item.consumption_time, item.created_at), reverse=True)


def get_record(record_id: str) -> TeaGuestConsumption | None:
    item = _records.get(record_id)
    if not item or item.is_deleted:
        return None
    return item


def create_record(data: TeaGuestConsumptionCreate, created_by: str = "") -> TeaGuestConsumption:
    with _record_lock:
        now = datetime.now(timezone.utc)
        values = data.model_dump()
        item = TeaGuestConsumption(
            id=str(uuid.uuid4()),
            **values,
            total_amount=_calculate_total(data.guest_count, data.unit_price),
            created_by=created_by,
            updated_by=created_by,
            created_at=now,
            updated_at=now,
        )
        _records[item.id] = item
        save_item(FILENAME, item.id, item.model_dump(mode="json"))
        return item


def update_record(
    record_id: str,
    data: TeaGuestConsumptionUpdate,
    updated_by: str = "",
) -> TeaGuestConsumption:
    with _record_lock:
        item = get_record(record_id)
        if not item:
            raise ValueError("消费记录不存在")
        values = data.model_dump()
        updated = item.model_copy(update={
            **values,
            "total_amount": _calculate_total(data.guest_count, data.unit_price),
            "updated_by": updated_by,
            "updated_at": datetime.now(timezone.utc),
        })
        _records[record_id] = updated
        save_item(FILENAME, record_id, updated.model_dump(mode="json"))
        return updated


def delete_record(record_id: str, updated_by: str = "") -> None:
    with _record_lock:
        item = get_record(record_id)
        if not item:
            raise ValueError("消费记录不存在")
        now = datetime.now(timezone.utc)
        deleted = item.model_copy(update={
            "is_deleted": True,
            "deleted_at": now,
            "updated_by": updated_by,
            "updated_at": now,
        })
        _records[record_id] = deleted
        save_item(FILENAME, record_id, deleted.model_dump(mode="json"))
