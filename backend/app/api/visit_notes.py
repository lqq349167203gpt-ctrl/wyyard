from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.models.visit_note import VisitNoteCreate, VisitNoteUpdate
from app.services import (
    customer_access_service,
    position_permission_service,
    visit_note_service,
    visit_service,
)
from app.utils.request_roles import get_request_roles


def _require_visit_permission(request: Request) -> str:
    role = getattr(request.state, "user_role", "") or ""
    if role == "超级管理员":
        return role
    allowed = {
        "class-records",
        "class-records-visitors",
        "class-records-activities",
        "class-records-arrival",
    }
    if not allowed.intersection(position_permission_service.get_permissions(get_request_roles(request))):
        raise HTTPException(status_code=403, detail="没有邀约页面权限")
    return role


router = APIRouter(
    prefix="/api/visit-notes",
    tags=["visit-notes"],
    dependencies=[Depends(_require_visit_permission)],
)

CATEGORY_LABELS = {
    "visit_need": "来访需求",
    "customer_info": "深度需求",
    "follow_up": "跟进点",
    "customer_feedback": "客户反馈",
}


def _actor(request: Request) -> tuple[str, str, str]:
    return (
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )


def _response(note, request: Request) -> dict:
    account_id, owner_name, username = _actor(request)
    result = customer_access_service.protect_note(note.model_dump(mode="json"), get_request_roles(request))
    if result is None:
        raise HTTPException(403, "没有查看该类信息的权限")
    can_manage = visit_note_service.can_manage_note(
        note, account_id, owner_name, username
    )
    result["category_label"] = CATEGORY_LABELS[note.category]
    result["can_edit"] = can_manage
    result["can_delete"] = can_manage
    return result


def _visit_context(visit_id: str) -> tuple[str, str]:
    """返回日志所需的客户昵称和邀约日期。"""
    visit = visit_service.get_visit(visit_id)
    if not visit:
        return "未知客户", ""
    from app.services import customer_service

    customer = customer_service.get_customer(visit.customer_id)
    return (customer.nickname if customer else "未知客户", visit.visit_date or "")


def _snapshot(note) -> dict:
    data = note.model_dump(mode="json")
    data.pop("category", None)
    data["category_label"] = CATEGORY_LABELS[note.category]
    customer, visit_date = _visit_context(note.visit_id)
    data["customer_nickname"] = customer
    data["visit_date"] = visit_date
    return data


def _subject(visit_id: str) -> str:
    return _visit_context(visit_id)[0]


def _require_visit_customer_scope(request: Request, visit_id: str, *, action: str = "查看"):
    visit = visit_service.get_visit(visit_id)
    if not visit:
        raise HTTPException(status_code=404, detail="邀约记录不存在")
    customer_access_service.require_customer_scope(request, visit.customer_id, action=action)
    return visit


def _log_content(action: str, note, previous: str | None = None, previous_person: str | None = None) -> str:
    category = CATEGORY_LABELS[note.category]
    customer, visit_date = _visit_context(note.visit_id)
    date_part = f"日期：{visit_date}｜" if visit_date else ""
    attribution = f"反馈人：{note.feedback_person or note.created_by or '未知'}｜创建人：{note.created_by or '未知'}｜"
    if previous_person is not None and previous_person != (note.feedback_person or note.created_by):
        attribution = f"反馈人：{previous_person or '未知'}→{note.feedback_person or note.created_by or '未知'}｜创建人：{note.created_by or '未知'}｜"
    if note.category == "follow_up":
        attribution += f"下次跟进人：{note.next_follow_up_person or '未设置'}｜跟进时间：{note.next_follow_up_date or '未设置'}｜"
    content = visit_note_service.display_content(note)
    if previous is not None and previous != content:
        return f"{action}{category}：{date_part}客户：{customer}｜{attribution}内容：{previous} → {content}"
    return f"{action}{category}：{date_part}客户：{customer}｜{attribution}内容：{content}"


def _follow_up_plan(request: Request, data, category: str, existing=None) -> dict | None:
    from app.services import customer_service

    keys = {"next_follow_up_person_id", "next_follow_up_person", "next_follow_up_date"}
    supplied = keys.intersection(data.model_fields_set)
    if category != "follow_up":
        if supplied:
            raise HTTPException(400, "仅跟进点可以设置下次跟进安排")
        return None
    if existing is not None and not supplied:
        return None
    _, owner, username = _actor(request)
    current_name = owner or username
    person_fields = supplied - {"next_follow_up_date"}
    if existing is not None and not person_fields:
        person_id, person_name = existing.next_follow_up_person_id, existing.next_follow_up_person
    elif not person_fields:
        person_id, person_name = "", current_name
    else:
        person_id = (data.next_follow_up_person_id or "").strip()
        person_name = (data.next_follow_up_person or "").strip()
    saved_person = bool(existing and person_id and person_id == existing.next_follow_up_person_id)
    if saved_person:
        person_name = existing.next_follow_up_person
    elif person_id:
        person = customer_service.get_customer(person_id)
        if not person or person.is_deleted:
            raise HTTPException(400, "下次跟进人不存在或已停用，请重新选择")
        person_name = person.nickname or person.name
    elif person_name and person_name != current_name:
        people = [c for c in customer_service.list_customers() if not c.is_deleted and person_name in {c.nickname, c.name}]
        if len(people) != 1:
            raise HTTPException(400, "请从搜索结果中选择唯一的下次跟进人")
        person_id, person_name = people[0].id, people[0].nickname or people[0].name
    day = ((data.next_follow_up_date or "") if "next_follow_up_date" in supplied
           else existing.next_follow_up_date if existing else "")
    return {"next_follow_up_person_id": person_id, "next_follow_up_person": person_name, "next_follow_up_date": day}


def _feedback_people(request: Request) -> dict:
    """邀约备注的反馈人候选：当前账号本人 + 系统里的课程老师。"""
    from app.api.statistics import COURSE_ACTIVITY_TYPES, _course_activity_teacher_ids
    from app.services import customer_service, service_teacher_customer_service
    from app.utils.record_ownership import request_actor_customer_ids

    customers = customer_service.list_customers()
    teaching_counts = Counter(
        teacher_id
        for _, _, loader in COURSE_ACTIVITY_TYPES
        for activity in loader()
        for teacher_id in _course_activity_teacher_ids(activity)
    )
    options = [
        {"name": customer.nickname or customer.name or customer.id, "customer_id": customer.id}
        for customer in customers
        if customer.id in teaching_counts
        or service_teacher_customer_service.TEACHER_POSITIONS.intersection(customer.positions or [])
    ]
    options.sort(key=lambda item: (-teaching_counts[item["customer_id"]], item["name"], item["customer_id"]))

    actor_name = (
        getattr(request.state, "user_owner", "")
        or getattr(request.state, "user_name", "")
        or ""
    ).strip()
    own_ids = request_actor_customer_ids(request)
    own_customer = next((customer for customer in customers if customer.id in own_ids), None)
    current = {
        "name": actor_name or (own_customer.nickname if own_customer else ""),
        "customer_id": own_customer.id if own_customer else "",
    }
    if current["name"] and not any(
        (current["customer_id"] and item["customer_id"] == current["customer_id"])
        or (not current["customer_id"] and item["name"] == current["name"])
        for item in options
    ):
        options.insert(0, current)
    return {"current_person": current, "options": options}


def _resolve_feedback_person(
    request: Request,
    person_id: str = "",
    person_name: str = "",
    existing=None,
) -> tuple[str, str]:
    """只接受当前账号本人或课程老师名单中的人，防止任意伪造归属。"""
    normalized_id = person_id.strip()
    normalized_name = person_name.strip()
    if existing is not None:
        saved_id = (existing.feedback_person_id or "").strip()
        saved_name = (existing.feedback_person or existing.created_by or "").strip()
        if (normalized_id and normalized_id == saved_id) or (
            not normalized_id and normalized_name and normalized_name == saved_name
        ):
            return saved_id, saved_name
    people = _feedback_people(request)
    if not normalized_id and not normalized_name:
        current = people["current_person"]
        return current["customer_id"], current["name"]
    for option in people["options"]:
        if normalized_id and option["customer_id"] == normalized_id:
            return option["customer_id"], option["name"]
        if not normalized_id and option["name"] == normalized_name:
            return option["customer_id"], option["name"]
    raise HTTPException(status_code=400, detail="反馈人不在课程老师名单中")


@router.get("")
def list_visit_notes(
    request: Request,
    visit_id: str | None = Query(None),
    visit_ids: str | None = Query(None),
):
    ids = [value for value in (visit_ids or "").split(",") if value]
    if visit_id:
        ids.append(visit_id)
    if not ids:
        raise HTTPException(status_code=400, detail="请指定邀约记录")
    for current_visit_id in set(ids):
        _require_visit_customer_scope(request, current_visit_id)
    account_id, owner_name, username = _actor(request)
    notes = visit_note_service.list_visible_notes(ids, account_id, owner_name, username)
    return [_response(note, request) for note in notes]


@router.get("/previous-visit-need")
def get_previous_visit_need(
    request: Request,
    customer_id: str = Query(..., min_length=1),
    before_date: str = Query(""),
    exclude_visit_id: str = Query(""),
):
    customer_access_service.require_customer_scope(request, customer_id)
    account_id, owner_name, username = _actor(request)
    result = visit_note_service.get_previous_visit_need(
        customer_id,
        before_date=before_date,
        exclude_visit_id=exclude_visit_id,
        account_id=account_id,
        owner_name=owner_name,
        username=username,
    )
    if not result:
        return None
    note, visit_date = result
    return {
        "visit_id": note.visit_id,
        "visit_date": visit_date,
        "content": visit_note_service.display_content(note),
    }


@router.get("/feedback-people")
def get_feedback_people(request: Request):
    return _feedback_people(request)


@router.get("/follow-up-people")
def follow_up_people(request: Request = None):
    """指派人员保留全平台姓名；仅可见客户补手机尾号供搜索。"""
    from app.services import customer_service
    from app.utils.customer_search import masked_customer_phone, phone_suffix

    visible_ids = customer_access_service.visible_customer_ids(request, customer_service.list_customers()) if request else set()
    return [{"id": c.id, "nickname": c.nickname or c.name, "name": c.name,
             "phone_suffix": phone_suffix(c) if c.id in visible_ids else "",
             "phone_masked": masked_customer_phone(c) if c.id in visible_ids else ""}
            for c in customer_service.list_customers() if not c.is_deleted and (c.nickname or c.name)]


@router.post("")
def create_visit_note(data: VisitNoteCreate, request: Request):
    _require_visit_customer_scope(request, data.visit_id, action="新增信息到")
    account_id, owner_name, username = _actor(request)
    feedback_person_id = feedback_person = ""
    if data.feedback_person_id or data.feedback_person:
        feedback_person_id, feedback_person = _resolve_feedback_person(request, data.feedback_person_id, data.feedback_person)
    existing = visit_note_service._find_creator_note(data.visit_id, data.category, account_id, owner_name or username)
    data = customer_access_service.prepare_note_write(request, data, data.category, existing)
    plan = _follow_up_plan(request, data, data.category, existing)
    try:
        note = visit_note_service.create_note(
            data.visit_id,
            data.category,
            data.content,
            creator_id=account_id,
            creator=owner_name or username,
            feedback_person_id=feedback_person_id,
            feedback_person=feedback_person,
            follow_up_plan=plan,
            need_tag_ids=data.need_tag_ids if "need_tag_ids" in data.model_fields_set else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    request.state.operation_log_context = {
        "content": _log_content("新增", note),
        "entity_id": note.id,
        "after_data": _snapshot(note),
    }
    return _response(note, request)


@router.patch("/{note_id}")
def update_visit_note(note_id: str, data: VisitNoteUpdate, request: Request):
    existing = visit_note_service.get_note(note_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    _require_visit_customer_scope(request, existing.visit_id, action="修改")
    data = customer_access_service.prepare_note_write(request, data, existing.category, existing)
    account_id, owner_name, username = _actor(request)
    if not visit_note_service.can_manage_note(existing, account_id, owner_name, username):
        raise HTTPException(status_code=403, detail="只能修改自己录入的信息")
    before = _snapshot(existing)
    previous = visit_note_service.display_content(existing)
    previous_person = existing.feedback_person or existing.created_by
    feedback_person_id = feedback_person = None
    if data.feedback_person_id is not None or data.feedback_person is not None:
        feedback_person_id, feedback_person = _resolve_feedback_person(
            request, data.feedback_person_id or "", data.feedback_person or "", existing
        )
    plan = _follow_up_plan(request, data, existing.category, existing)
    try:
        note = visit_note_service.update_note(
            note_id,
            data.content,
            feedback_person_id=feedback_person_id,
            feedback_person=feedback_person,
            follow_up_plan=plan,
            need_tag_ids=data.need_tag_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    request.state.operation_log_context = {
        "content": _log_content("修改", note, previous, previous_person),
        "entity_id": note.id,
        "before_data": before,
        "after_data": _snapshot(note),
    }
    return _response(note, request)


@router.delete("/{note_id}")
def delete_visit_note(note_id: str, request: Request):
    note = visit_note_service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="记录不存在")
    _require_visit_customer_scope(request, note.visit_id, action="删除")
    customer_access_service.require_note_access(request, note.category)
    account_id, owner_name, username = _actor(request)
    if not visit_note_service.can_manage_note(note, account_id, owner_name, username):
        raise HTTPException(status_code=403, detail="只能删除自己录入的信息")
    if note.category == "visit_need":
        tabs = customer_access_service.get_customer_permissions(get_request_roles(request))["detail_tabs"]
        content = "" if tabs["visit_need_detail"] else note.content
        tags = [] if tabs["visit_need_tags"] else note.need_tags
        if content or tags:
            before = _snapshot(note)
            visit_note_service.update_note(note.id, content, need_tag_ids=[] if tabs["visit_need_tags"] else None)
            request.state.operation_log_context = {"content": _log_content("清空可见部分", note),
                "entity_id": note.id, "before_data": before, "after_data": _snapshot(note)}
            return {"ok": True}
    request.state.operation_log_context = {
        "content": _log_content("删除", note),
        "entity_id": note.id,
        "before_data": _snapshot(note),
    }
    visit_note_service.delete_note(note_id)
    return {"ok": True}
