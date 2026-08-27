from typing import List, Optional

from fastapi import APIRouter, Query

from app.models.base import StrictBaseModel
from app.services import activity_order_service

router = APIRouter(prefix="/api/activity-orders", tags=["activity-orders"])


class SaveOrderRequest(StrictBaseModel):
    date: str
    space_id: str = ""
    order: List[str]
    moved_name: str = ""
    from_position: Optional[int] = None
    to_position: Optional[int] = None


@router.get("")
async def get_order(
    date: str = Query(...),
    space_id: Optional[str] = Query(None),
):
    return activity_order_service.get_order(date, space_id or "")


@router.post("")
async def save_order(data: SaveOrderRequest):
    activity_order_service.save_order(data.date, data.space_id, data.order)
    return {"ok": True}
