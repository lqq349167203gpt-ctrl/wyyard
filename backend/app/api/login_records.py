from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field

from app.middleware.jwt_auth import require_page_permission
from app.models.base import StrictBaseModel
from app.services import login_record_service
from app.utils.pagination import paginate
from app.utils.request_context import get_client_ip, get_client_source

router = APIRouter(prefix="/api/login-records", tags=["login-records"])
require_login_records = require_page_permission("login-records")


class UsageHeartbeatRequest(StrictBaseModel):
    client_session_id: str = Field(min_length=8, max_length=80)
    page_path: str = Field(default="", max_length=300)
    active: bool = True


@router.post("/heartbeat")
def record_heartbeat(data: UsageHeartbeatRequest, request: Request):
    """所有已登录员工均可上报活跃状态，无需拥有使用统计查看权限。"""
    from app.services import account_service

    account_id = getattr(request.state, "user_id", "")
    account = account_service.get_account(account_id)
    if not account:
        raise HTTPException(status_code=401, detail="未登录")
    session = login_record_service.record_usage_heartbeat(
        account=account,
        client_session_id=data.client_session_id,
        source=get_client_source(request),
        ip=get_client_ip(request),
        page_path=data.page_path,
        active=data.active,
        device_info=request.headers.get("user-agent", ""),
    )
    return {"success": True, "last_heartbeat_at": session.last_heartbeat_at}


@router.get("/summary")
def get_summary(_role: str = Depends(require_login_records)):
    return login_record_service.get_account_summary()


@router.get("")
def list_records(
    account_id: Optional[str] = None,
    event_type: Optional[str] = Query(None, pattern="^(login|page_view|operation|usage)?$"),
    source: Optional[str] = Query(None, pattern="^(pc|miniprogram)?$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    keyword: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _role: str = Depends(require_login_records),
):
    if event_type == "operation":
        return login_record_service.list_operation_activity_paginated(
            account_id=account_id,
            source=source,
            date_from=date_from.isoformat() if date_from else None,
            date_to=date_to.isoformat() if date_to else None,
            keyword=keyword,
            page=page,
            page_size=page_size,
        )
    items = login_record_service.list_activity(
        account_id=account_id,
        event_type=event_type,
        source=source,
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
        keyword=keyword,
    )
    return paginate(items, page, page_size)
