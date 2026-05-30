import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.reminder import Reminder, ReminderCreate, ReminderCondition
from app.services.storage import load_data, save_data

FILENAME = "reminders.json"
_reminders: Dict[str, Reminder] = {}


def _load():
    global _reminders
    data = load_data(FILENAME)
    _reminders = {}
    for k, v in data.items():
        conditions = [ReminderCondition(**c) for c in v.get("conditions", [])]
        _reminders[k] = Reminder(conditions=conditions, **{key: val for key, val in v.items() if key != "conditions"})


def _save():
    data = {}
    for k, v in _reminders.items():
        data[k] = v.model_dump(mode="json")
    save_data(FILENAME, data)


_load()


def list_reminders() -> List[Reminder]:
    return [v for v in _reminders.values() if not v.is_deleted]


def get_reminder(reminder_id: str) -> Optional[Reminder]:
    r = _reminders.get(reminder_id)
    if r and r.is_deleted:
        return None
    return r


def create_reminder(data: ReminderCreate) -> Reminder:
    now = datetime.now(timezone.utc)
    r = Reminder(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _reminders[r.id] = r
    _save()
    return r


def update_reminder(reminder_id: str, data: dict) -> Optional[Reminder]:
    r = _reminders.get(reminder_id)
    if not r:
        return None
    for key, value in data.items():
        if key == "conditions":
            r.conditions = [ReminderCondition(**c) for c in value]
        elif hasattr(r, key):
            setattr(r, key, value)
    r.updated_at = datetime.now(timezone.utc)
    _reminders[reminder_id] = r
    _save()
    return r


def delete_reminder(reminder_id: str) -> bool:
    r = _reminders.get(reminder_id)
    if not r:
        return False
    r.is_deleted = True
    r.deleted_at = datetime.now(timezone.utc)
    _save()
    return True
