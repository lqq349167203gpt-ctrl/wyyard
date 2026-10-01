import uuid
from datetime import datetime, timezone
from typing import Iterable

from app.models.activity_participant_note import (
    ActivityParticipantNote,
    ActivityParticipantNoteCategory,
    ActivityParticipantNoteSource,
)
from app.services.daily_customer_note_service import note_lock
from app.services.storage import load_data, save_item

FILENAME = "activity_participant_notes.json"
_notes: dict[str, ActivityParticipantNote] = {}
_note_lock = note_lock


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
    from app.services import daily_customer_note_service

    return sorted(
        daily_customer_note_service.for_course(activity_source, session_id, ids),
        key=lambda note: (note.updated_at, note.id),
        reverse=True,
    )


def list_customer_notes(customer_id: str) -> list[ActivityParticipantNote]:
    from app.services import visit_service

    visit_days = {v.visit_date for v in visit_service.list_basic_visits({customer_id}) if not v.cancelled}
    return sorted(
        (
            note
            for note in _notes.values()
            if note.customer_id == customer_id and not note.is_deleted
            and note.activity_date not in visit_days
        ),
        key=lambda note: (note.activity_date, note.updated_at, note.id),
        reverse=True,
    )


def list_notes_by_creator(
    actor_id: str = "",
    actor_name: str = "",
) -> list[ActivityParticipantNote]:
    """「客户跟进」用：只看这个人自己填过的记录（老数据按填写人姓名兜底）。"""
    if not actor_id and not actor_name:
        return []
    return sorted(
        (
            note
            for note in _notes.values()
            if not note.is_deleted
            and (
                (note.created_by_id and note.created_by_id == actor_id)
                or (not note.created_by_id and actor_name and note.created_by == actor_name)
            )
        ),
        key=lambda note: (note.activity_date, note.updated_at, note.id),
        reverse=True,
    )


def update_note_content(
    *,
    note_id: str,
    content: str,
    actor_id: str = "",
    actor_name: str = "",
    feedback_person_id: str | None = None,
    feedback_person: str | None = None,
) -> ActivityParticipantNote:
    """客户跟进页里直接改自己填过的内容；不是本人填的不能改。"""
    normalized = content.strip()
    if not normalized:
        raise ValueError("记录内容不能为空")
    with _note_lock:
        note = get_note(note_id)
        if not note:
            raise LookupError("记录不存在")
        if not can_manage_note(note, actor_id, actor_name):
            raise PermissionError("只能修改自己填写的记录")
        if note_id.startswith("visit-note|"):
            from app.services import visit_note_service

            visit_note_service.update_note(note_id.split("|")[-1], normalized)
            return get_note(note_id)
        note.content = normalized
        if feedback_person_id is not None or feedback_person is not None:
            note.feedback_person_id = (feedback_person_id or "").strip()
            note.feedback_person = (feedback_person or "").strip() or note.created_by
        note.updated_at = datetime.now(timezone.utc)
        _notes[note.id] = note
        _save(note)
        return note


def get_note(note_id: str) -> ActivityParticipantNote | None:
    if note_id.startswith("visit-note|"):
        from app.services import daily_customer_note_service

        return daily_customer_note_service.resolve_course_note(note_id)
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
                for note in list_notes(activity_source, session_id, {customer_id})
                if note.customer_id == customer_id
                and note.category == category
                and not note.is_deleted
                and can_manage_note(note, actor_id, actor_name)
            ),
            None,
        )
        if existing:
            return update_note_content(
                note_id=existing.id, content=normalized_content,
                actor_id=actor_id, actor_name=actor_name,
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
    if note_id.startswith("visit-note|"):
        from app.services import visit_note_service

        if not get_note(note_id):
            return False
        return visit_note_service.delete_note(note_id.split("|")[-1])
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
