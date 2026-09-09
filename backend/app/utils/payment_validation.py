"""付费项目公共金额校验。"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from fastapi import HTTPException

CENT = Decimal("0.01")


def _as_dict(value) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return {}


def _money(value, label: str) -> Decimal:
    if isinstance(value, bool):
        raise HTTPException(status_code=400, detail=f"{label}格式不正确")
    try:
        amount = Decimal(str(0 if value is None or value == "" else value))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"{label}格式不正确") from None
    if not amount.is_finite() or amount < 0:
        raise HTTPException(status_code=400, detail=f"{label}必须是非负金额")
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def ensure_payment_closer_total(data, amount_field: str, existing=None, request=None) -> None:
    """保留金额格式校验；新录入流程已取消成交人金额合计校验。"""
    if request is not None:
        source = str(request.headers.get("x-client-type", "") or "").lower()
        if source not in {"pc", "miniprogram"}:
            # 兼容不经过两个录入端的历史内部任务；页面请求始终携带来源头。
            return
    incoming = _as_dict(data)
    current = _as_dict(existing)
    fee = _money(incoming.get(amount_field, current.get(amount_field, 0)), "费用金额")
    _ = fee
