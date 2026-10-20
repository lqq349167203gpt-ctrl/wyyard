"""每堂课独立的参与确认；不修改邀约到店状态，不触发扣卡。"""

import threading
from datetime import datetime, timezone

from app.services import storage

FILENAME = "course_attendance.json"
_lock = threading.RLock()


def course_key(source: str, session_id: str) -> str:
    return f"{source}:{session_id}"


def list_confirmations(source: str, session_id: str) -> dict:
    return storage.load_item(FILENAME, course_key(source, session_id)) or {}


def confirm(source: str, session_id: str, customer_ids: list[str], actor_id: str, actor: str, record=None) -> dict:
    with _lock:
        entries = list_confirmations(source, session_id)
        now = datetime.now(timezone.utc).isoformat()
        for customer_id in dict.fromkeys(customer_ids):
            if is_current(entries.get(customer_id, {}), record, customer_id):
                continue
            entries[customer_id] = {"attended": True, "confirmed_at": now,
                                    "operator_id": actor_id, "operator": actor}
        storage.save_item(FILENAME, course_key(source, session_id), entries)
        return entries


def is_current(entry: dict, record, customer_id: str) -> bool:
    if not entry.get("attended"):
        return False
    last_withdrawal = max((e.withdrawn_at.isoformat() for e in (getattr(record, "withdrawal_records", []) or [])
                           if e.customer_id == customer_id), default="")
    return entry.get("confirmed_at", "") > last_withdrawal


SOURCE_KEYS = {"class": "class_record", "gcs": "group_case", "ers": "emotional_release",
               "eks": "energy_knot", "ics": "internal_course"}


def snapshot() -> dict:
    return storage.load_data(FILENAME)


def attended_ids(source: str, session_id: str, legacy_ids: set[str], *, record=None, confirmations=None) -> set[str]:
    """已有明确确认时采用本场名单，旧课程继续保留原统计口径。"""
    source = SOURCE_KEYS.get(source, source)
    entries = (confirmations.get(course_key(source, session_id), {}) if confirmations is not None
               else list_confirmations(source, session_id))
    if not entries:
        return legacy_ids
    from app.services.daily_customer_note_service import course_context

    record = record or course_context(source, session_id)
    withdrawn = set(getattr(record, "withdrawn_participant_ids", []) or [])
    return {cid for cid, entry in entries.items() if cid not in withdrawn and is_current(entry, record, cid)}
