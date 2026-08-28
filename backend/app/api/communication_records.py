from fastapi import APIRouter, HTTPException, Query, Request

from app.models.communication_record import CommunicationRecordCreate
from app.services import communication_record_service, customer_access_service, customer_service

router = APIRouter(prefix="/api/communication-records", tags=["communication-records"])


def _compact_content(content: str, limit: int = 80) -> str:
    """压缩日志摘要中的沟通内容，完整原文仍保存在操作快照中。"""
    compact = " ".join((content or "").split())
    return compact if len(compact) <= limit else f"{compact[:limit]}…"


def _log_summary(
    action: str,
    customer_nickname: str,
    content: str,
    previous_content: str | None = None,
) -> str:
    nickname = customer_nickname or "未知客户"
    summary = _compact_content(content) or "（内容为空）"
    if previous_content is not None:
        previous = _compact_content(previous_content) or "（内容为空）"
        return f"{action}沟通记录：客户：{nickname}｜内容：{previous} → {summary}"
    return f"{action}沟通记录：客户：{nickname}｜内容：{summary}"


def _actor(request: Request) -> tuple[str, str, str]:
    return (
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )


def _record_response(record, request: Request) -> dict:
    account_id, owner_name, username = _actor(request)
    data = record.model_dump(mode="json")
    can_manage = communication_record_service.can_manage_record(
        record, account_id, owner_name, username,
    )
    data["can_edit"] = can_manage
    data["can_delete"] = can_manage
    return data


def _require_customer_access(request: Request, nickname: str):
    customer = customer_service.get_by_nickname(nickname)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在或已停用")
    role = getattr(request.state, "user_role", "") or ""
    if not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail="没有查看该客户的权限")
    if not customer_access_service.can_view_detail_tab(role, "communication"):
        raise HTTPException(status_code=403, detail="没有查看沟通记录的权限")
    return customer


@router.get("")
def list_communication_records(request: Request, customer_nickname: str = Query(None)):
    records = communication_record_service.list_records()
    if customer_nickname:
        _require_customer_access(request, customer_nickname)
        records = [r for r in records if r.customer_nickname == customer_nickname]
    else:
        role = getattr(request.state, "user_role", "") or ""
        if not customer_access_service.can_view_detail_tab(role, "communication"):
            raise HTTPException(status_code=403, detail="没有查看沟通记录的权限")
        visible_names = {
            customer.nickname
            for customer in customer_access_service.filter_customers(request, customer_service.list_customers())
            if customer.nickname
        }
        records = [record for record in records if record.customer_nickname in visible_names]
    return [_record_response(record, request) for record in records]


@router.post("")
def create_communication_record(data: CommunicationRecordCreate, request: Request):
    _require_customer_access(request, data.customer_nickname)
    account_id, owner_name, username = _actor(request)
    creator = owner_name or username
    record = communication_record_service.create_record(data, creator, account_id)
    record_data = record.model_dump(mode="json")
    request.state.operation_log_context = {
        "content": _log_summary("新增", record.customer_nickname, record.content),
        "entity_id": record.id,
        "after_data": record_data,
    }
    return _record_response(record, request)


@router.put("/{record_id}")
def update_communication_record(record_id: str, data: CommunicationRecordCreate, request: Request):
    existing = communication_record_service.get_record(record_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    _require_customer_access(request, existing.customer_nickname)
    if data.customer_nickname != existing.customer_nickname:
        _require_customer_access(request, data.customer_nickname)
    account_id, owner_name, username = _actor(request)
    if not communication_record_service.can_manage_record(
        existing, account_id, owner_name, username,
    ):
        raise HTTPException(status_code=403, detail="只能修改自己新增的沟通记录")
    record = communication_record_service.update_record(record_id, data)
    request.state.operation_log_context = {
        "content": _log_summary(
            "修改",
            record.customer_nickname,
            record.content,
            existing.content,
        ),
        "entity_id": record.id,
        "before_data": existing.model_dump(mode="json"),
        "after_data": record.model_dump(mode="json"),
    }
    return _record_response(record, request)


@router.delete("/{record_id}")
def delete_communication_record(record_id: str, request: Request):
    record = communication_record_service.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    _require_customer_access(request, record.customer_nickname)
    account_id, owner_name, username = _actor(request)
    if not communication_record_service.can_manage_record(
        record, account_id, owner_name, username,
    ):
        raise HTTPException(status_code=403, detail="只能删除自己新增的沟通记录")
    request.state.operation_log_context = {
        "before_data": record.model_dump(mode="json"),
        "content": _log_summary("删除", record.customer_nickname, record.content),
        "entity_id": record.id,
    }
    communication_record_service.delete_record(record_id)
    return {"ok": True}
