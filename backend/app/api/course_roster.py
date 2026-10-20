"""管理端本场学员名单和上课确认。"""

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field

from app.models.activity_participant_note import ActivityParticipantNoteSource
from app.models.base import StrictBaseModel
from app.services import (
    activity_lock_service,
    course_attendance_service,
    customer_access_service,
    customer_service,
    position_permission_service,
    visit_note_service,
    visit_service,
)
from app.utils.record_ownership import can_request_edit_activity_content, ensure_activity_withdrawal_access
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/course-roster")
RECORD_TYPES = {"class_record": "class", "group_case": "gcs", "emotional_release": "ers",
                "energy_knot": "eks", "internal_course": "ics"}


def _context(request, source, session_id):
    from app.api.class_records import _activity_note_context

    roles = get_request_roles(request)
    if "超级管理员" not in roles and "daily-activities" not in position_permission_service.get_permissions(roles):
        raise HTTPException(403, "没有课表页面权限")
    context = _activity_note_context(source, session_id)
    if getattr(context["record"], "is_deleted", False):
        raise HTTPException(404, "课程记录不存在")
    return context


def _can_edit(request, record):
    try:
        activity_lock_service.ensure_record_unlocked(record)
    except HTTPException:
        return False
    return can_request_edit_activity_content(request, record)


@router.get("")
def roster(request: Request, activity_source: ActivityParticipantNoteSource, session_id: str):
    from app.api.class_records import _activity_note_actor
    from app.api.visit_notes import _feedback_people, _response, follow_up_people

    context = _context(request, activity_source, session_id)
    record = context["record"]
    roles = get_request_roles(request)
    customers = customer_service.list_all_customers()
    visible = customer_access_service.visible_customer_ids(request, customers)
    ids = context["participant_ids"] & visible
    teacher_ids = set(getattr(record, "teacher_ids", []) or [])
    ids -= teacher_ids
    withdrawn = set(getattr(record, "withdrawn_participant_ids", []) or [])
    visits = [v for v in visit_service.list_basic_visits(ids)
              if v.visit_date == record.date and not v.cancelled]
    visit_customers = {v.id: v.customer_id for v in visits}
    actor_id, actor = _activity_note_actor(request)
    needs = {}
    if customer_access_service.can_view_note(roles, "visit_need"):
        for note in visit_note_service.list_visible_notes(
            list(visit_customers), actor_id, actor, getattr(request.state, "user_name", "") or "",
        ):
            if note.category == "visit_need":
                needs.setdefault(visit_customers[note.visit_id], []).append(_response(note, request))
    confirmations = course_attendance_service.list_confirmations(activity_source, session_id)
    can_edit = _can_edit(request, record)
    try:
        activity_lock_service.ensure_record_unlocked(record)
        ensure_activity_withdrawal_access(request, record)
        can_withdraw = True
    except HTTPException:
        can_withdraw = False
    people = []
    for customer in customers:
        if customer.id not in ids:
            continue
        entry = confirmations.get(customer.id, {})
        people.append({
            "id": customer.id, "nickname": customer.nickname or customer.name or "未命名客户",
            "member_type": customer.member_type, "card_status": getattr(customer, "card_status", ""), "card_status_tone": getattr(customer, "card_status_tone", "neutral"), "role": "案主" if customer.id == getattr(record, "owner_id", "") else "参与者",
            "withdrawn": customer.id in withdrawn,
            "attended": course_attendance_service.is_current(entry, record, customer.id) and customer.id not in withdrawn,
            "confirmed_at": entry.get("confirmed_at", ""), "confirmed_by": entry.get("operator", ""),
            "visit_needs": needs.get(customer.id, []),
        })
    return {"id": session_id, "source": activity_source, "record_type": RECORD_TYPES[activity_source],
            "name": context["activity_name"], "date": record.date,
            "start_time": context["start_time"], "end_time": context["end_time"],
            "mode": getattr(record, "activity_mode", "线下"), "participants": people,
            "can_confirm": can_edit, "can_withdraw": can_withdraw,
            "can_edit_notes": can_edit, "feedback_people": _feedback_people(request),
            "follow_up_people": follow_up_people()}


class ConfirmAttendance(StrictBaseModel):
    activity_source: ActivityParticipantNoteSource
    session_id: str = Field(min_length=1, max_length=100)
    customer_ids: list[str] = Field(min_length=1, max_length=200)


@router.post("/confirm")
def confirm_attendance(data: ConfirmAttendance, request: Request):
    from app.api.class_records import _activity_note_actor

    context = _context(request, data.activity_source, data.session_id)
    record = context["record"]
    activity_lock_service.ensure_record_unlocked(record)
    if not can_request_edit_activity_content(request, record):
        raise HTTPException(403, "没有确认本场上课的权限")
    if record.date > datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat():
        raise HTTPException(400, "未来课程不能提前确认已上课")
    ids = set(data.customer_ids)
    if ids - context["participant_ids"]:
        raise HTTPException(400, "选择的客户不在本场课程名单中")
    if ids & set(getattr(record, "withdrawn_participant_ids", []) or []):
        raise HTTPException(400, "已退课人员不能确认上课")
    for cid in ids:
        customer_access_service.require_customer_scope(request, cid, action="确认上课")
    actor_id, actor = _activity_note_actor(request)
    course_attendance_service.confirm(data.activity_source, data.session_id, data.customer_ids, actor_id, actor, record)
    request.state.operation_log_context = {
        "entity_id": data.session_id,
        "content": f"确认上课：{context['activity_name']}（{record.date}），{len(ids)} 人；不触发扣卡",
        "after_data": {"课程": context["activity_name"], "客户ID": sorted(ids), "操作人": actor},
    }
    return {"message": "已确认本场上课", "customer_ids": sorted(ids)}


@router.delete("/notes/{note_id}")
def delete_course_note(note_id: str, activity_source: ActivityParticipantNoteSource, session_id: str, request: Request):
    from app.api.class_records import _activity_note_actor
    from app.services import activity_participant_note_service

    context = _context(request, activity_source, session_id)
    if not _can_edit(request, context["record"]):
        raise HTTPException(403, "没有修改本场课程记录的权限，或课程已锁定")
    note = activity_participant_note_service.get_note(note_id)
    if not note or note.activity_source != activity_source or note.session_id != session_id or note_id.startswith("visit-note|"):
        raise HTTPException(404, "本场记录不存在")
    customer_access_service.require_customer_scope(request, note.customer_id)
    customer_access_service.require_note_access(request, note.category)
    if not activity_participant_note_service.can_manage_note(note, *_activity_note_actor(request)):
        raise HTTPException(403, "只能修改自己填写的记录")
    activity_participant_note_service.delete_note(note_id)
    request.state.operation_log_context = {"entity_id": note.id, "content": f"清空本场记录：{context['activity_name']} · {note.content}"}
    return {"message": "已清空本人记录"}
