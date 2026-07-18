from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from app.services import client_notification_service

router = APIRouter(prefix="/api/client/notifications", tags=["client-notifications"])


@router.get("")
def list_notifications(request: Request):
    customer_id = getattr(request.state, "customer_id", "") or getattr(request.state, "user_id", "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    items = client_notification_service.list_notifications(customer_id)
    resp = JSONResponse({
        "items": [n.model_dump(mode="json") for n in items],
        "unread_count": sum(1 for n in items if not n.is_read),
    })
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@router.patch("/{notification_id}/read")
def mark_read(notification_id: str, request: Request):
    customer_id = getattr(request.state, "customer_id", "") or getattr(request.state, "user_id", "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    n = client_notification_service.mark_read(notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="通知不存在")
    return n.model_dump(mode="json")
