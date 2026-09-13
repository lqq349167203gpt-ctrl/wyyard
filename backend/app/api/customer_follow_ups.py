"""客户跟进：只看自己填过的「来访需求 / 客户信息 / 跟进点」，可以就地修改。

数据来源是邀约里的备注（visit_notes），所以一行 = 一次邀约：
给谁填的（客户）+ 几月几号来的（邀约日期）+ 当天参加的活动（邀约上的 activities）。
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field

from app.models.base import StrictBaseModel
from app.services import (
    customer_access_service,
    customer_service,
    position_permission_service,
    visit_note_service,
    visit_service,
)
from app.utils.request_roles import get_request_roles
from app.utils.pagination import paginate


def require_follow_up_access(request: Request) -> str:
    """填写/查看客户跟进：客户跟进页面权限，或课程记录页面权限（课程记录的「参与者」页签要能填）。"""
    roles = get_request_roles(request)
    if "超级管理员" in roles:
        return "超级管理员"
    pages = position_permission_service.get_permissions(roles)
    if "customer-follow-ups" in pages or "course-statistics" in pages:
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


class CustomerFollowUpCreate(StrictBaseModel):
    visit_id: str = Field(min_length=1, max_length=100)
    category: Literal["visit_need", "customer_info", "follow_up"]
    content: str = Field(min_length=1, max_length=5000)


def _actor(request: Request) -> tuple[str, str, str]:
    return (
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )


def _build_rows(notes: list) -> list[dict]:
    """同一次邀约的来访需求 / 客户信息 / 跟进点合成一行。"""
    grouped: dict[str, dict] = {}
    for note in notes:
        visit = visit_service.get_visit_without_metrics(note.visit_id)
        if not visit:
            continue
        row = grouped.get(note.visit_id)
        if row is None:
            customer = customer_service.get_customer(visit.customer_id)
            row = grouped[note.visit_id] = {
                "id": note.visit_id,
                "visit_id": note.visit_id,
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
        if note.category in CATEGORIES:
            row[note.category] = {"id": note.id, "content": note.content, "updated_at": note.updated_at}
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
    notes = visit_note_service.list_notes_by_creator(account_id, owner_name, username)
    rows = _build_rows(notes)
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
            return {"id": note.id, "content": note.content, "updated_at": note.updated_at.isoformat()}
    return None


@router.post("")
def create_customer_follow_up(data: CustomerFollowUpCreate, request: Request):
    """自己那边空着的位置直接补填一条（同一场邀约同一类只有一条）。"""
    account_id, owner_name, username = _actor(request)
    visit = visit_service.get_visit_without_metrics(data.visit_id)
    if not visit:
        raise HTTPException(status_code=404, detail="邀约记录不存在")
    customer_access_service.require_customer_scope(request, visit.customer_id, action="填写客户跟进到")
    try:
        note = visit_note_service.create_note(
            data.visit_id,
            data.category,
            data.content,
            creator_id=account_id,
            creator=owner_name or username,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    customer = customer_service.get_customer(visit.customer_id)
    customer_name = (getattr(customer, "nickname", "") or getattr(customer, "name", "") or "") if customer else "未知客户"
    request.state.operation_log_context = {
        "content": (
            f"填写客户跟进{CATEGORY_LABELS.get(note.category, '')}：客户：{customer_name}｜"
            f"日期：{visit.visit_date or ''}｜内容：{note.content}"
        ),
        "entity_id": note.id,
        "after_data": note.model_dump(mode="json"),
    }
    return {
        "id": note.id,
        "visit_id": note.visit_id,
        "category": note.category,
        "content": note.content,
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
    try:
        updated = visit_note_service.update_note(note_id, data.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="记录不存在")

    visit = visit_service.get_visit_without_metrics(updated.visit_id)
    customer = customer_service.get_customer(visit.customer_id) if visit else None
    customer_name = (getattr(customer, "nickname", "") or getattr(customer, "name", "") or "") if customer else "未知客户"
    visit_date = getattr(visit, "visit_date", "") if visit else ""
    # 写操作进「操作日志」，使用统计的操作明细读的也是这份
    request.state.operation_log_context = {
        "content": (
            f"修改客户跟进{CATEGORY_LABELS.get(updated.category, '')}：客户：{customer_name}｜"
            f"日期：{visit_date}｜内容：{updated.content}"
        ),
        "entity_id": updated.id,
        "after_data": updated.model_dump(mode="json"),
    }
    return {
        "id": updated.id,
        "visit_id": updated.visit_id,
        "category": updated.category,
        "content": updated.content,
        "updated_at": updated.updated_at.isoformat(),
    }
