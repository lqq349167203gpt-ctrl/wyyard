from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.models.visit_note import VisitNoteCreate, VisitNoteUpdate
from app.services import position_permission_service, visit_note_service, visit_service


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
    if not allowed.intersection(position_permission_service.get_permissions(role)):
        raise HTTPException(status_code=403, detail="没有邀约页面权限")
    return role


router = APIRouter(
    prefix="/api/visit-notes",
    tags=["visit-notes"],
    dependencies=[Depends(_require_visit_permission)],
)

CATEGORY_LABELS = {
    "customer_info": "客户信息",
    "follow_up": "跟进点",
}


def _actor(request: Request) -> tuple[str, str, str]:
    return (
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )


def _response(note, request: Request) -> dict:
    account_id, owner_name, username = _actor(request)
    result = note.model_dump(mode="json")
    can_manage = visit_note_service.can_manage_note(
        note, account_id, owner_name, username
    )
    result["category_label"] = CATEGORY_LABELS[note.category]
    result["can_edit"] = can_manage
    result["can_delete"] = can_manage
    return result


def _snapshot(note) -> dict:
    data = note.model_dump(mode="json")
    data.pop("category", None)
    data["category_label"] = CATEGORY_LABELS[note.category]
    return data


def _subject(visit_id: str) -> str:
    visit = visit_service.get_visit(visit_id)
    if not visit:
        return "未知客户"
    from app.services import customer_service

    customer = customer_service.get_customer(visit.customer_id)
    return customer.nickname if customer else "未知客户"


def _log_content(action: str, note, previous: str | None = None) -> str:
    category = CATEGORY_LABELS[note.category]
    customer = _subject(note.visit_id)
    if previous is not None:
        return f"{action}{category}：客户：{customer}｜内容：{previous} → {note.content}"
    return f"{action}{category}：客户：{customer}｜内容：{note.content}"


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
    return [_response(note, request) for note in visit_note_service.list_notes(ids)]


@router.post("")
def create_visit_note(data: VisitNoteCreate, request: Request):
    account_id, owner_name, username = _actor(request)
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
    account_id, owner_name, username = _actor(request)
    if not visit_note_service.can_manage_note(existing, account_id, owner_name, username):
        raise HTTPException(status_code=403, detail="只能修改自己录入的信息")
    before = _snapshot(existing)
    previous = existing.content
    try:
        note = visit_note_service.update_note(note_id, data.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    request.state.operation_log_context = {
        "content": _log_content("修改", note, previous),
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
    account_id, owner_name, username = _actor(request)
    if not visit_note_service.can_manage_note(note, account_id, owner_name, username):
        raise HTTPException(status_code=403, detail="只能删除自己录入的信息")
    request.state.operation_log_context = {
        "content": _log_content("删除", note),
        "entity_id": note.id,
        "before_data": _snapshot(note),
    }
    visit_note_service.delete_note(note_id)
    return {"ok": True}
