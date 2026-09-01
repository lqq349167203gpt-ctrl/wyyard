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
    """校验 PC/管理端小程序的成交人金额，PATCH 时按旧记录补全未提交字段。"""
    if request is not None:
        source = str(request.headers.get("x-client-type", "") or "").lower()
        if source not in {"pc", "miniprogram"}:
            # 兼容不经过两个录入端的历史内部任务；页面请求始终携带来源头。
            return
    incoming = _as_dict(data)
    current = _as_dict(existing)
    fee = _money(incoming.get(amount_field, current.get(amount_field, 0)), "费用金额")
    closers = incoming.get("closers", current.get("closers", []))
    if not isinstance(closers, list):
        raise HTTPException(status_code=400, detail="成交人金额明细格式不正确")

    total = Decimal("0")
    for closer in closers:
        if not isinstance(closer, dict):
            raise HTTPException(status_code=400, detail="成交人金额明细格式不正确")
        total += _money(closer.get("amount", 0), "成交人金额")
    total = total.quantize(CENT, rounding=ROUND_HALF_UP)

    if total != fee:
        raise HTTPException(
            status_code=400,
            detail=f"成交人金额合计 ¥{total:.2f} 必须与费用金额 ¥{fee:.2f} 一致",
        )
