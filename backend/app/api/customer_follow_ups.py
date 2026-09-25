"""客户跟进：只看自己填过的「来访需求 / 客户信息 / 跟进点」，可以就地修改。

数据来源是邀约里的备注（visit_notes），所以一行 = 一次邀约：
给谁填的（客户）+ 几月几号来的（邀约日期）+ 当天参加的活动（邀约上的 activities）。
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field

from app.api.visit_notes import _feedback_people, _resolve_feedback_person
from app.models.base import StrictBaseModel
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

CATEGORIES = ("visit_need", "customer_info", "follow_up")
CATEGORY_LABELS = {"visit_need": "来访需求", "customer_info": "客户信息", "follow_up": "跟进点"}


class CustomerFollowUpUpdate(StrictBaseModel):
    content: str = Field(min_length=1, max_length=5000)
    feedback_person_id: str | None = None
    feedback_person: str | None = None


class CustomerFollowUpCreate(StrictBaseModel):
    visit_id: str = Field(min_length=1, max_length=100)
    category: Literal["visit_need", "customer_info", "follow_up"]
    content: str = Field(min_length=1, max_length=5000)
    feedback_person_id: str = ""
    feedback_person: str = ""


def _actor(request: Request) -> tuple[str, str, str]:
    return (
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )


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
    if not customer_access_service.can_view_detail_tab(get_request_roles(request), "follow_up"):
        notes = [note for note in notes if note.category != "visit_need"]
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
    account_id, owner_name, username = _actor(request)
    for note in visit_note_service.list_notes([visit_id]):
        if note.category != category:
            continue
        if visit_note_service.can_manage_note(note, account_id, owner_name, username):
            return {
                "id": note.id,
                "content": note.content,
                "feedback_person_id": note.feedback_person_id,
                "feedback_person": note.feedback_person or note.created_by,
                "created_by": note.created_by,
                "can_edit": True,
                "updated_at": note.updated_at.isoformat(),
            }
    return None


@router.get("/feedback-people")
def get_feedback_people_for_follow_ups(request: Request):
    return _feedback_people(request)


@router.post("")
def create_customer_follow_up(data: CustomerFollowUpCreate, request: Request):
    """自己那边空着的位置直接补填一条（同一场邀约同一类只有一条）。"""
    account_id, owner_name, username = _actor(request)
    visit = visit_service.get_visit_without_metrics(data.visit_id)
    if not visit:
        raise HTTPException(status_code=404, detail="邀约记录不存在")
    customer_access_service.require_customer_scope(request, visit.customer_id, action="填写客户跟进到")
    feedback_person_id = feedback_person = ""
    if data.feedback_person_id or data.feedback_person:
        feedback_person_id, feedback_person = _resolve_feedback_person(request, data.feedback_person_id, data.feedback_person)
    try:
        note = visit_note_service.create_note(
            data.visit_id,
            data.category,
            data.content,
            creator_id=account_id,
            creator=owner_name or username,
            feedback_person_id=feedback_person_id,
            feedback_person=feedback_person,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    customer = customer_service.get_customer(visit.customer_id)
    customer_name = (getattr(customer, "nickname", "") or getattr(customer, "name", "") or "") if customer else "未知客户"
    request.state.operation_log_context = {
        "content": (
            f"填写客户跟进·{CATEGORY_LABELS.get(note.category, '')}：客户：{customer_name}｜"
            f"日期：{visit.visit_date or ''}｜反馈人：{note.feedback_person or note.created_by}｜"
            f"创建人：{note.created_by}｜内容：{note.content}"
        ),
        "entity_id": note.id,
        "after_data": note.model_dump(mode="json"),
    }
    return {
        "id": note.id,
        "visit_id": note.visit_id,
        "category": note.category,
        "content": note.content,
        "feedback_person_id": note.feedback_person_id,
        "feedback_person": note.feedback_person or note.created_by,
        "created_by": note.created_by,
        "can_edit": True,
        "updated_at": note.updated_at.isoformat(),
    }


@router.patch("/{note_id}")
def update_customer_follow_up(note_id: str, data: CustomerFollowUpUpdate, request: Request):
    """就地修改自己填的那一条（来访需求 / 客户信息 / 跟进点）。"""
    account_id, owner_name, username = _actor(request)
    note = visit_note_service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="记录不存在")
    if not visit_note_service.can_manage_note(note, account_id, owner_name, username):
        raise HTTPException(status_code=403, detail="只能修改自己填写的记录")
    before = note.model_dump(mode="json")
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
        ),
        "entity_id": updated.id,
        "before_data": before,
        "after_data": updated.model_dump(mode="json"),
    }
    return {
        "id": updated.id,
        "visit_id": updated.visit_id,
        "category": updated.category,
        "content": updated.content,
        "feedback_person_id": updated.feedback_person_id,
        "feedback_person": updated.feedback_person or updated.created_by,
        "created_by": updated.created_by,
        "can_edit": True,
        "updated_at": updated.updated_at.isoformat(),
    }
