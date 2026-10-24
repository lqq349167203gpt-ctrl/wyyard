"""客户跟进：只看自己填过的「来访需求 / 客户信息 / 跟进点」，可以就地修改。

数据来源是邀约里的备注（visit_notes），所以一行 = 一次邀约：
给谁填的（客户）+ 几月几号来的（邀约日期）+ 当天参加的活动（邀约上的 activities）。
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field

from app.api.visit_notes import _feedback_people, _follow_up_plan, _resolve_feedback_person, _response, follow_up_people
from app.models.visit_note import VisitNoteCreate, VisitNoteUpdate
from app.services import (
    customer_access_service,
    customer_service,
    position_permission_service,
    visit_note_service,
    visit_service,
)
from app.utils.pagination import paginate
from app.utils.record_ownership import request_actor_customer_ids
from app.utils.request_roles import get_request_roles


def require_follow_up_access(request: Request) -> str:
    """参与者页签填写/查看客户跟进，权限跟随课程记录。"""
    roles = get_request_roles(request)
    if "超级管理员" in roles:
        return "超级管理员"
    pages = position_permission_service.get_permissions(roles)
    if "course-statistics" in pages:
        return roles[0] if roles else ""
    raise HTTPException(status_code=403, detail="权限不足")


router = APIRouter(
    prefix="/api/customer-follow-ups",
    tags=["客户跟进"],
    dependencies=[Depends(require_follow_up_access)],
)

CATEGORIES = ("visit_need", "customer_info", "follow_up", "customer_feedback")
CATEGORY_LABELS = {"visit_need": "来访需求", "customer_info": "深度需求", "follow_up": "跟进点", "customer_feedback": "客户反馈"}


class CustomerFollowUpUpdate(VisitNoteUpdate):
    """与邀约共用字段与校验，避免新标签、跟进安排漏接入口。"""


class CustomerFollowUpCreate(VisitNoteCreate):
    visit_id: str = Field(min_length=1, max_length=100)
    category: Literal["visit_need", "customer_info", "follow_up", "customer_feedback"]


def _actor(request: Request) -> tuple[str, str, str]:
    return (
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )


def _require_category_access(request: Request, category: str):
    customer_access_service.require_note_access(request, category)


def _build_rows(notes: list, actor: tuple[str, str, str]) -> list[dict]:
    """按邀约和创建人合并；同一邀约的代填记录不能覆盖本人记录。"""
    grouped: dict[str, dict] = {}
    for note in notes:
        visit = visit_service.get_visit_without_metrics(note.visit_id)
        if not visit:
            continue
        creator_key = note.created_by_id or note.created_by or note.id
        group_key = f"{note.visit_id}:{creator_key}"
        row = grouped.get(group_key)
        if row is None:
            customer = customer_service.get_customer(visit.customer_id)
            row = grouped[group_key] = {
                "id": group_key,
                "visit_id": note.visit_id,
                "created_by": note.created_by,
                "can_edit": visit_note_service.can_manage_note(note, *actor),
                "customer_id": visit.customer_id,
                "customer_name": (getattr(customer, "nickname", "") or getattr(customer, "name", "") or "") if customer else "",
                "customer_identity": (getattr(customer, "member_type", "") or "") if customer else "",
                "visit_date": visit.visit_date or "",
                "visit_time": visit.visit_time or "",
                "activities": [item.name for item in (getattr(visit, "activities", None) or []) if getattr(item, "name", "")],
                "updated_at": note.updated_at,
                "visit_need": None,
                "customer_info": None,
                "follow_up": None,
                "customer_feedback": None,
            }
        if note.category in CATEGORIES and row[note.category] is None:
            row[note.category] = {
                "id": note.id,
                "content": note.content,
                "feedback_person_id": note.feedback_person_id,
                "feedback_person": note.feedback_person or note.created_by,
                "created_by": note.created_by,
                "can_edit": visit_note_service.can_manage_note(note, *actor),
                "updated_at": note.updated_at,
            }
        if note.updated_at > row["updated_at"]:
            row["updated_at"] = note.updated_at
    rows = sorted(
        grouped.values(),
        key=lambda item: (item["visit_date"], item["updated_at"]),
        reverse=True,
    )
    for row in rows:
        row["updated_at"] = row["updated_at"].isoformat()
        for category in CATEGORIES:
            slot = row[category]
            if slot:
                slot["updated_at"] = slot["updated_at"].isoformat()
    return rows


@router.get("")
def list_customer_follow_ups(
    request: Request,
    keyword: str = "",
    date_from: str = "",
    date_to: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    account_id, owner_name, username = _actor(request)
    notes = visit_note_service.list_notes_for_follow_up(
        account_id, owner_name, username, request_actor_customer_ids(request)
    )
    notes = [visible for note in notes if (visible := customer_access_service.protect_note(note, get_request_roles(request))) is not None]
    rows = _build_rows(notes, (account_id, owner_name, username))
    needle = keyword.strip().casefold()
    if needle:
        rows = [row for row in rows if needle in (row["customer_name"] or "").casefold()]
    if date_from:
        rows = [row for row in rows if row["visit_date"] and row["visit_date"] >= date_from]
    if date_to:
        rows = [row for row in rows if row["visit_date"] and row["visit_date"] <= date_to]
    return paginate(rows, page, page_size)


@router.get("/my-note")
def get_my_follow_up_note(request: Request, visit_id: str = Query(..., min_length=1), category: str = Query(...)):
    """课程记录的「参与者」页签编辑时用：拿我自己在这一天这一类填过的那一条。"""
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="未知的记录类型")
    _require_category_access(request, category)
    visit = visit_service.get_visit_without_metrics(visit_id)
    if not visit:
        raise HTTPException(404, "邀约记录不存在")
    customer_access_service.require_customer_scope(request, visit.customer_id)
    account_id, owner_name, username = _actor(request)
    for note in visit_note_service.list_notes([visit_id]):
        if note.category != category:
            continue
        if visit_note_service.can_manage_note(note, account_id, owner_name, username):
            return _response(note, request)
    return None


@router.get("/feedback-people")
def get_feedback_people_for_follow_ups(request: Request):
    return _feedback_people(request)


@router.get("/follow-up-people")
def get_follow_up_people_for_participants(request: Request):
    return follow_up_people(request)


@router.get("/need-tags")
def get_need_tags_for_participants(request: Request):
    from app.services import customer_tag_service

    if not customer_access_service.can_view_detail_tab(get_request_roles(request), "visit_need_tags"):
        raise HTTPException(403, "没有来访需求的查看权限")
    return customer_tag_service.list_visible_tags(_actor(request)[0], category="visit_need")


@router.post("")
def create_customer_follow_up(data: CustomerFollowUpCreate, request: Request):
    _require_category_access(request, data.category)
    """自己那边空着的位置直接补填一条（同一场邀约同一类只有一条）。"""
    account_id, owner_name, username = _actor(request)
    existing = visit_note_service._find_creator_note(data.visit_id, data.category, account_id, owner_name or username)
    data = customer_access_service.prepare_note_write(request, data, data.category, existing)
    visit = visit_service.get_visit_without_metrics(data.visit_id)
    if not visit:
        raise HTTPException(status_code=404, detail="邀约记录不存在")
    customer_access_service.require_customer_scope(request, visit.customer_id, action="填写客户跟进到")
    feedback_person_id = feedback_person = ""
    if data.feedback_person_id or data.feedback_person:
        feedback_person_id, feedback_person = _resolve_feedback_person(request, data.feedback_person_id, data.feedback_person)
    plan = _follow_up_plan(request, data, data.category)
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

    customer = customer_service.get_customer(visit.customer_id)
    customer_name = (getattr(customer, "nickname", "") or getattr(customer, "name", "") or "") if customer else "未知客户"
    request.state.operation_log_context = {
        "content": (
            f"填写客户跟进·{CATEGORY_LABELS.get(note.category, '')}：客户：{customer_name}｜"
            f"日期：{visit.visit_date or ''}｜反馈人：{note.feedback_person or note.created_by}｜"
            f"创建人：{note.created_by}｜内容：{visit_note_service.display_content(note)}"
            + (f"｜下次跟进人：{note.next_follow_up_person}｜跟进时间：{note.next_follow_up_date}" if note.category == "follow_up" else "")
        ),
        "entity_id": note.id,
        "after_data": note.model_dump(mode="json"),
    }
    return _response(note, request)


@router.patch("/{note_id}")
def update_customer_follow_up(note_id: str, data: CustomerFollowUpUpdate, request: Request):
    """就地修改自己填的那一条（来访需求 / 客户信息 / 跟进点）。"""
    account_id, owner_name, username = _actor(request)
    note = visit_note_service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="记录不存在")
    if not visit_note_service.can_manage_note(note, account_id, owner_name, username):
        raise HTTPException(status_code=403, detail="只能修改自己填写的记录")
    _require_category_access(request, note.category)
    data = customer_access_service.prepare_note_write(request, data, note.category, note)
    before = note.model_dump(mode="json")
    visit = visit_service.get_visit_without_metrics(note.visit_id)
    if not visit:
        raise HTTPException(404, "邀约记录不存在")
    customer_access_service.require_customer_scope(request, visit.customer_id, action="修改客户跟进到")
    plan = _follow_up_plan(request, data, note.category, note)
    if not data.content.strip() and not (data.need_tag_ids if data.need_tag_ids is not None else note.need_tags):
        visit_note_service.delete_note(note.id)
        request.state.operation_log_context = {
            "content": f"清空本人填写的客户跟进·{CATEGORY_LABELS.get(note.category, '')}：{before['content']}",
            "entity_id": note.id, "before_data": before, "after_data": {"is_deleted": True},
        }
        return {**_response(note, request), "content": "", "need_tags": [], "deleted": True,
                "next_follow_up_person_id": "", "next_follow_up_person": "", "next_follow_up_date": ""}
    feedback_person_id = feedback_person = None
    if data.feedback_person_id is not None or data.feedback_person is not None:
        feedback_person_id, feedback_person = _resolve_feedback_person(
            request, data.feedback_person_id or "", data.feedback_person or "", note
        )
    try:
        updated = visit_note_service.update_note(
            note_id, data.content,
            feedback_person_id=feedback_person_id,
            feedback_person=feedback_person,
            follow_up_plan=plan,
            need_tag_ids=data.need_tag_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="记录不存在")

    visit = visit_service.get_visit_without_metrics(updated.visit_id)
    customer = customer_service.get_customer(visit.customer_id) if visit else None
    customer_name = (getattr(customer, "nickname", "") or getattr(customer, "name", "") or "") if customer else "未知客户"
    visit_date = getattr(visit, "visit_date", "") if visit else ""
    old_person = before.get("feedback_person") or before.get("created_by") or "未知"
    new_person = updated.feedback_person or updated.created_by or "未知"
    person_summary = f"{old_person}→{new_person}" if old_person != new_person else new_person
    content_summary = f"{before['content']} → {updated.content}" if before["content"] != updated.content else updated.content
    # 写操作进「操作日志」，使用统计的操作明细读的也是这份
    request.state.operation_log_context = {
        "content": (
            f"修改客户跟进·{CATEGORY_LABELS.get(updated.category, '')}：客户：{customer_name}｜"
            f"日期：{visit_date}｜反馈人：{person_summary}｜创建人：{updated.created_by}｜"
            f"内容：{content_summary}"
            + (f"｜下次跟进人：{updated.next_follow_up_person}｜跟进时间：{updated.next_follow_up_date}" if updated.category == "follow_up" else "")
        ),
        "entity_id": updated.id,
        "before_data": before,
        "after_data": updated.model_dump(mode="json"),
    }
    return _response(updated, request)
