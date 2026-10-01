"""课表与邀约是当天客户信息的两个入口；投影已有记录，不复制业务数据。"""

import threading

from app.models.activity_participant_note import ActivityParticipantNote
from app.models.visit_note import VisitNote

note_lock = threading.RLock()


def course_context(source: str, session_id: str):
    from app.services import (
        class_record_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
    )

    getter = {
        "class_record": class_record_service.get_record,
        "group_case": group_case_session_service.get_session,
        "emotional_release": emotional_release_session_service.get_session,
        "energy_knot": energy_knot_session_service.get_session,
        "internal_course": internal_course_session_service.get_session,
    }.get(source)
    return getter(session_id) if getter else None


def for_course(source: str, session_id: str, customer_ids: set[str]):
    from app.services import activity_participant_note_service, visit_note_service, visit_service

    course = course_context(source, session_id)
    if not course:
        return []
    day = str(getattr(course, "date", "") or "")
    ids = customer_ids or set(getattr(course, "participant_ids", []) or [])
    if not customer_ids:
        for group in getattr(course, "groups", []) or []:
            ids.update([group.leader_id, group.deputy_id, *group.member_ids])
        owner_id = getattr(course, "owner_id", "")
        if owner_id:
            ids.add(owner_id)
        ids.discard("")
    notes = [n for n in activity_participant_note_service._notes.values()
             if not n.is_deleted and n.activity_date == day and n.customer_id in ids]
    visits = [v for v in visit_service.list_basic_visits(ids)
              if v.visit_date == day and not v.cancelled]
    visit_note_service.ensure_legacy_entries([v.id for v in visits])
    visits_by_id = {v.id: v for v in visits}
    for note in visit_note_service._notes.values():
        if not note.is_deleted and note.category in {"customer_info", "follow_up"} and note.visit_id in visits_by_id:
            notes.append(as_course_note(note, source, session_id, visits_by_id[note.visit_id]))
    return notes


def as_course_note(note, source: str, session_id: str, visit):
    course = course_context(source, session_id)
    return ActivityParticipantNote(
        **{k: v for k, v in note.model_dump().items() if k in ActivityParticipantNote.model_fields},
        activity_source=source, session_id=session_id, customer_id=visit.customer_id,
        activity_date=visit.visit_date,
        activity_name=str(getattr(course, "course_name", "") or getattr(course, "activity_name", "") or getattr(course, "name", "") or ""),
    ).model_copy(update={"id": f"visit-note|{source}|{session_id}|{note.id}"})


def as_visit_note(note, visit_id: str):
    fields = {k: v for k, v in note.model_dump().items() if k in VisitNote.model_fields}
    fields["feedback_person"] = fields.get("feedback_person") or note.created_by
    return VisitNote(**fields, visit_id=visit_id).model_copy(
        update={"id": f"course-note|{visit_id}|{note.id}"},
    )


def for_visits(visit_ids: set[str]):
    from app.services import activity_participant_note_service, visit_service

    visits = [v for v in visit_service.list_basic_visits() if v.id in visit_ids and not v.cancelled]
    by_day = {}
    for note in activity_participant_note_service._notes.values():
        if not note.is_deleted:
            by_day.setdefault((note.customer_id, note.activity_date), []).append(note)
    return [as_visit_note(note, visit.id) for visit in visits
            for note in by_day.get((visit.customer_id, visit.visit_date), [])]


def resolve_course_note(note_id: str):
    from app.services import visit_note_service, visit_service

    parts = note_id.split("|")
    if len(parts) != 4 or parts[0] != "visit-note":
        return None
    _, source, session_id, original_id = parts
    note = visit_note_service._notes.get(original_id)
    if not note or note.is_deleted or note.category not in {"customer_info", "follow_up"}:
        return None
    visit = visit_service.get_visit_without_metrics(note.visit_id)
    course = course_context(source, session_id)
    if not visit or not course or visit.is_deleted or visit.cancelled or visit.visit_date != str(getattr(course, "date", "") or ""):
        return None
    return as_course_note(note, source, session_id, visit)


def resolve_visit_note(note_id: str):
    from app.services import activity_participant_note_service, visit_service

    parts = note_id.split("|")
    if len(parts) != 3 or parts[0] != "course-note":
        return None
    _, visit_id, original_id = parts
    note = activity_participant_note_service._notes.get(original_id)
    visit = visit_service.get_visit_without_metrics(visit_id)
    if not note or note.is_deleted or not visit or visit.is_deleted or visit.cancelled:
        return None
    if note.customer_id != visit.customer_id or note.activity_date != visit.visit_date:
        return None
    return as_visit_note(note, visit_id)


def visit_summary(visit_id: str):
    return visit_summaries({visit_id}).get(visit_id, {})


def visit_summaries(visit_ids):
    from app.services import visit_note_service

    grouped = {}
    fields = {"customer_info": "feedback", "follow_up": "healing_notes"}
    for note in visit_note_service.list_notes(visit_ids, ensure_legacy=False):
        if note.category in fields:
            grouped.setdefault(note.visit_id, {}).setdefault(fields[note.category], []).append(
                f"{visit_note_service.display_author(note)}：{note.content}",
            )
    return {visit_id: {field: "\n".join(lines) for field, lines in values.items()}
            for visit_id, values in grouped.items()}
