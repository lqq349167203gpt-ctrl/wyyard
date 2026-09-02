from fastapi import APIRouter, HTTPException, Request

from app.models.follow_up_status import FollowUpStatusCreate, FollowUpStatusUpdate
from app.services import follow_up_status_service, position_permission_service
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/follow-up-statuses", tags=["follow-up-statuses"])


def _require_access(request: Request, write: bool = False) -> None:
    role = getattr(request.state, "user_role", "")
    permissions = set(position_permission_service.get_permissions(get_request_roles(request)))
    allowed = role == "超级管理员" or bool({"customer-tags", "healing-records", "referral-statistics"} & permissions)
    if not allowed or (write and role != "超级管理员" and "customer-tags" not in permissions):
        raise HTTPException(status_code=403, detail="权限不足")


@router.get("")
def list_statuses(request: Request, include_disabled: bool = False):
    _require_access(request)
    return follow_up_status_service.list_statuses(include_disabled)


@router.post("")
def create_status(data: FollowUpStatusCreate, request: Request):
    _require_access(request, write=True)
    try:
        return follow_up_status_service.create_status(data)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.put("/{status_id}")
def update_status(status_id: str, data: FollowUpStatusUpdate, request: Request):
    _require_access(request, write=True)
    try:
        result = follow_up_status_service.update_status(status_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="跟进状态不存在")
    return result
