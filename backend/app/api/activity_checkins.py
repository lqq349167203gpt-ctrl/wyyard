from fastapi import APIRouter, Depends, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.base import StrictBaseModel
from app.services import activity_checkin_service

router = APIRouter(prefix="/api/activity-checkins", tags=["活动核销"])
require_checkin = require_page_permission("activity-checkin")


class ScanRequest(StrictBaseModel):
    code: str


@router.post("/preview")
def preview(data: ScanRequest, request: Request, _permission=Depends(require_checkin)):
    request.state.skip_operation_log = True
    return activity_checkin_service.inspect_code(data.code, request)[0]


@router.post("/confirm")
def confirm(data: ScanRequest, request: Request, _permission=Depends(require_checkin)):
    return activity_checkin_service.confirm(data.code, request)
