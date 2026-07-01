from fastapi import APIRouter, Query, Request
from app.models.base import StrictBaseModel
from typing import Optional

from app.services import business_reminder_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/business-reminders", tags=["business-reminders"])


class ToggleRequest(StrictBaseModel):
    description: Optional[str] = ""


@router.get("")
async def list_business_reminders(
    request: Request,
    handled: Optional[bool] = Query(None, description="按处理状态筛选"),
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    user_id = getattr(request.state, "user_id", "")
    user_role = getattr(request.state, "user_role", "")
    items = business_reminder_service.evaluate_reminders(user_id, user_role, handled_filter=handled)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.patch("/{item_id}/toggle")
async def toggle_business_reminder_status(item_id: str, body: ToggleRequest = None):
    desc = body.description if body else ""
    handled = business_reminder_service.toggle_status(item_id, description=desc)
    return {"handled": handled}
