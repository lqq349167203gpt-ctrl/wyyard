import threading
import uuid
from datetime import datetime, timezone
from typing import Iterable

from app.models.activity_participant_note import (
    ActivityParticipantNote,
    ActivityParticipantNoteCategory,
    ActivityParticipantNoteSource,
)
from app.services.storage import load_data, save_item

FILENAME = "activity_participant_notes.json"
_notes: dict[str, ActivityParticipantNote] = {}
_note_lock = threading.RLock()


def _load() -> None:
    global _notes
    data = load_data(FILENAME)
    _notes = {
        key: ActivityParticipantNote(**value)
        for key, value in data.items()
    }


_load()


def _save(note: ActivityParticipantNote) -> None:
    save_item(FILENAME, note.id, note.model_dump(mode="json"))


def list_notes(
    activity_source: ActivityParticipantNoteSource,
    session_id: str,
    customer_ids: Iterable[str] = (),
) -> list[ActivityParticipantNote]:
    ids = {customer_id for customer_id in customer_ids if customer_id}
    return sorted(
        (
            note
            for note in _notes.values()
            if note.activity_source == activity_source
            and note.session_id == session_id
            and not note.is_deleted
            and (not ids or note.customer_id in ids)
        ),
        key=lambda note: (note.updated_at, note.id),
        reverse=True,
    )


def list_customer_notes(customer_id: str) -> list[ActivityParticipantNote]:
    return sorted(
        (
            note
            for note in _notes.values()
            if note.customer_id == customer_id and not note.is_deleted
        ),
        key=lambda note: (note.activity_date, note.updated_at, note.id),
        reverse=True,
    )


def get_note(note_id: str) -> ActivityParticipantNote | None:
    note = _notes.get(note_id)
    return note if note and not note.is_deleted else None


def can_manage_note(
    note: ActivityParticipantNote,
    actor_id: str = "",
    actor_name: str = "",
) -> bool:
    if note.created_by_id:
        return bool(actor_id and note.created_by_id == actor_id)
    return bool(actor_name and note.created_by == actor_name)


def upsert_note(
    *,
    activity_source: ActivityParticipantNoteSource,
    session_id: str,
    customer_id: str,
    category: ActivityParticipantNoteCategory,
    content: str,
    activity_name: str,
    activity_date: str,
    start_time: str,
    end_time: str,
    actor_id: str,
    actor_name: str,
) -> ActivityParticipantNote:
    normalized_content = content.strip()
    if not normalized_content:
        raise ValueError("记录内容不能为空")
    now = datetime.now(timezone.utc)
    with _note_lock:
        existing = next(
            (
                note
                for note in _notes.values()
                if note.activity_source == activity_source
                and note.session_id == session_id
                and note.customer_id == customer_id
                and note.category == category
                and not note.is_deleted
                and can_manage_note(note, actor_id, actor_name)
            ),
            None,
        )
        note = ActivityParticipantNote(
            id=existing.id if existing else str(uuid.uuid4())[:12],
            activity_source=activity_source,
            session_id=session_id,
            customer_id=customer_id,
            category=category,
            content=normalized_content,
            activity_name=activity_name,
            activity_date=activity_date,
            start_time=start_time,
            end_time=end_time,
            created_by_id=actor_id,
            created_by=actor_name,
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        _notes[note.id] = note
        _save(note)
        return note


def delete_note(note_id: str) -> bool:
    with _note_lock:
        note = get_note(note_id)
        if not note:
            return False
        now = datetime.now(timezone.utc)
        note.is_deleted = True
        note.deleted_at = now
        note.updated_at = now
        _save(note)
        return True


def completed_customer_ids(
    activity_source: ActivityParticipantNoteSource,
    session_id: str,
) -> set[str]:
    categories_by_customer: dict[str, set[str]] = {}
    for note in list_notes(activity_source, session_id):
        categories_by_customer.setdefault(note.customer_id, set()).add(note.category)
    return {
        customer_id
        for customer_id, categories in categories_by_customer.items()
        if {"customer_info", "follow_up"}.issubset(categories)
    }
