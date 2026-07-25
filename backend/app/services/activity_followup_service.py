import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.activity_followup import ActivityFollowup
from app.services.storage import delete_item, load_data, save_item

FILENAME = "activity_followups.json"
_records: dict[str, ActivityFollowup] = {}
_record_lock = threading.Lock()


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {key: ActivityFollowup(**value) for key, value in data.items()}


_load()


def list_followups(customer_id: str = "") -> list[ActivityFollowup]:
    records = list(_records.values())
    if customer_id:
        records = [record for record in records if record.customer_id == customer_id]
    return sorted(records, key=lambda record: record.updated_at, reverse=True)


def get_by_activity(customer_id: str, activity_key: str) -> Optional[ActivityFollowup]:
    return next(
        (
            record
            for record in _records.values()
            if record.customer_id == customer_id and record.activity_key == activity_key
        ),
        None,
    )


def upsert_followup(customer_id: str, activity: dict, content: str) -> ActivityFollowup:
    activity_key = f"{activity['activity_type']}:{activity['session_id']}"
    now = datetime.now(timezone.utc)
    with _record_lock:
        existing = get_by_activity(customer_id, activity_key)
        record = ActivityFollowup(
            id=existing.id if existing else str(uuid.uuid4())[:12],
            customer_id=customer_id,
            activity_key=activity_key,
            activity_type=activity["activity_type"],
            session_id=activity["session_id"],
            activity_name=activity.get("name", ""),
            activity_category=activity.get("type", ""),
            activity_date=activity.get("date", ""),
            start_time=activity.get("start_time", "") or "",
            end_time=activity.get("end_time", "") or "",
            teacher=activity.get("host", "") or "",
            customer_role=activity.get("role", "") or "",
            content=content,
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        _records[record.id] = record
        save_item(FILENAME, record.id, record.model_dump(mode="json"))
        return record


def delete_followup(record_id: str) -> bool:
    with _record_lock:
        if record_id not in _records:
            return False
        del _records[record_id]
        delete_item(FILENAME, record_id)
        return True
