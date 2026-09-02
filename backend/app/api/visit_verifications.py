from fastapi import APIRouter, HTTPException, Query, Request

from app.models.base import StrictBaseModel
from app.services import position_edit_permission_service, visit_verification_service
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/visit-verifications", tags=["visit-verifications"])


class VisitVerificationRequest(StrictBaseModel):
    date: str
    space_id: str = ""


def _can_manage(request: Request) -> bool:
    roles = get_request_roles(request)
    return "超级管理员" in roles or position_edit_permission_service.get_permissions(roles)["visit_lock"]


def _require_permission(request: Request) -> None:
    if not _can_manage(request):
        raise HTTPException(status_code=403, detail="当前账号没有邀约核对与锁定权限")


def _response(item, request: Request, *, date: str = "", space_id: str = "") -> dict:
    result = item.model_dump(mode="json") if item else {
        "date": date,
        "space_id": space_id,
        "is_verified": False,
        "verified_by_id": "",
        "verified_by": "",
        "verified_at": None,
    }
    result["can_manage"] = _can_manage(request)
    return result


@router.get("")
async def list_verifications(
    request: Request,
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    space_id: str | None = Query(None),
):
    return visit_verification_service.list_verifications(start_date, end_date, space_id)


@router.get("/status")
async def get_status(date: str, space_id: str = "", request: Request = None):
    return _response(
        visit_verification_service.get_verification(date, space_id),
        request,
        date=date,
        space_id=space_id,
    )


@router.post("/verify")
async def verify(data: VisitVerificationRequest, request: Request):
    _require_permission(request)
    previous = visit_verification_service.get_verification(data.date, data.space_id)
    before_data = previous.model_dump(mode="json") if previous else None
    item = visit_verification_service.set_verified(
        data.date,
        data.space_id,
        verified=True,
        operator_id=getattr(request.state, "user_id", "") or "",
        operator=(
            getattr(request.state, "user_owner", "")
            or getattr(request.state, "user_name", "")
            or ""
        ),
    )
    request.state.operation_log_context = {
        "content": f"核对并锁定邀约：{data.date}",
        "entity_id": item.id,
        "before_data": before_data,
        "after_data": item.model_dump(mode="json"),
    }
    return _response(item, request)


@router.post("/unverify")
async def unverify(data: VisitVerificationRequest, request: Request):
    _require_permission(request)
    previous = visit_verification_service.get_verification(data.date, data.space_id)
    before_data = previous.model_dump(mode="json") if previous else None
    item = visit_verification_service.set_verified(data.date, data.space_id, verified=False)
    request.state.operation_log_context = {
        "content": f"解锁邀约：{data.date}",
        "entity_id": item.id,
        "before_data": before_data,
        "after_data": item.model_dump(mode="json"),
    }
    return _response(item, request)
