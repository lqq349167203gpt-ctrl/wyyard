"""线上茶疗购买记录；有效期支持天或自然月，不参与金额与扣卡计算。"""

import uuid
from datetime import date, datetime, timedelta, timezone

from dateutil.relativedelta import relativedelta

from app.models.online_tea import OnlineTea, OnlineTeaCreate
from app.services.storage import load_data, save_item

FILENAME = "online_tea.json"
_records = {key: OnlineTea(**value) for key, value in load_data(FILENAME).items()}


def list_records():
    return [item for item in _records.values() if not item.is_deleted]


def get_record(record_id):
    item = _records.get(record_id)
    return item if item and not item.is_deleted else None


def _save(item):
    save_item(FILENAME, item.id, item.model_dump(mode="json"))
    _records[item.id] = item
    from app.services.member_identity_service import refresh_member_type

    refresh_member_type(item.customer_id)


def _values(data):
    values = data.model_dump()
    values["closers"] = [{**closer, "amount": 0} for closer in values["closers"]]
    start = date.fromisoformat(data.effective_date)
    end = start + (timedelta(days=data.validity_value) if data.validity_unit == "day"
                   else relativedelta(months=data.validity_value))
    values["expiry_date"] = (end - timedelta(days=1)).isoformat()
    return values


def create_record(data: OnlineTeaCreate):
    now = datetime.now(timezone.utc)
    item = OnlineTea(id=uuid.uuid4().hex[:12], created_at=now, updated_at=now, **_values(data))
    _save(item)
    return item


def update_record(record_id, data):
    old = get_record(record_id)
    if not old:
        return None
    allowed = set(OnlineTeaCreate.model_fields) - {"created_by", "created_by_id", "amount_recorded"}
    values = {**old.model_dump(), **{key: value for key, value in data.items() if key in allowed}}
    validated = OnlineTeaCreate(**values)
    item = old.model_copy(update={**_values(validated), "updated_at": datetime.now(timezone.utc)})
    _save(item)
    if old.customer_id != item.customer_id:
        from app.services.member_identity_service import refresh_member_type

        refresh_member_type(old.customer_id)
    return item


def delete_record(record_id):
    old = get_record(record_id)
    if not old:
        return False
    _save(old.model_copy(update={"is_deleted": True, "deleted_at": datetime.now(timezone.utc)}))
    return True
