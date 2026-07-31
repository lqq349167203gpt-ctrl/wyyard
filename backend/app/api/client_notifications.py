from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.api.customer_detail import _build_payment_records
from app.services import client_notification_service

router = APIRouter(prefix="/api/client/notifications", tags=["client-notifications"])


def _notification_datetime(value: str, fallback_date: str = "") -> datetime:
    text = str(value or fallback_date or "")
    if len(text) == 10:
        text = f"{text}T12:00:00+00:00"
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _format_amount(value) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value or "")
    return f"{number:.2f}".rstrip("0").rstrip(".")


def _sync_financial_notifications(customer_id: str) -> None:
    """把购买记录幂等同步到消息通知，兼容历史数据。"""
    for payment in _build_payment_records(customer_id):
        source_id = payment.get("source_id")
        if not source_id:
            continue
        source_created_at = _notification_datetime(
            payment.get("source_created_at"),
            payment.get("created_at"),
        )
        quantity = payment.get("quantity")
        quantity_text = "不限次" if quantity == "不限" else f"{quantity} 次"
        content_lines = [
            payment.get("name") or payment.get("type") or "购买项目",
            f"购买数量：{quantity_text}",
            f"支付金额：¥{_format_amount(payment.get('amount'))}",
        ]
        if payment.get("voided"):
            content_lines.append("状态：已退费")
        client_notification_service.ensure_notification(
            source_key=f"purchase:{payment.get('type')}:{source_id}",
            customer_id=customer_id,
            type="purchase",
            title="购买信息",
            content="\n".join(content_lines),
            created_at=source_created_at,
            activity_name=payment.get("name") or "",
            activity_date=payment.get("effective_date") or "",
            operator=payment.get("closer_name") or "",
            legacy_created_at=source_created_at,
        )


@router.get("")
def list_notifications(request: Request):
    customer_id = getattr(request.state, "customer_id", "") or getattr(request.state, "user_id", "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    _sync_financial_notifications(customer_id)
    items = [
        item
        for item in client_notification_service.list_notifications(customer_id)
        if item.type != "deduction"
    ]
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
