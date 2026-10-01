from datetime import date, datetime
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.services import (
    customer_access_service,
    customer_service,
    payment_export_service,
    position_permission_service,
)
from app.utils.pagination import paginate
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/payment-exports", tags=["payment-exports"])

ExportRangeType = Literal["day", "month", "year", "custom"]


@router.get("/records")
def list_payment_records(
    request: Request, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
    nickname: str = "", closer_name: str = "",
):
    """全部类型统一分页；筛选及余量仍沿用各项目的权限和业务计算。"""
    from app.services.payment_sources import fill_effective_remaining

    customer_access_service.require_transaction_access(request, detail=True)
    visible_ids = customer_access_service.visible_customer_ids(request, customer_service.list_all_customers())
    items = []
    for project_type, _, loader in payment_export_service.PROJECT_SOURCES:
        for record in loader():
            if record.customer_id not in visible_ids:
                continue
            item = record.model_dump(mode="json")
            if nickname and nickname.lower() not in (item.get("nickname") or "").lower():
                continue
            closer_names = [item.get("closer_name") or "", *(c.get("name") or "" for c in item.get("closers") or [])]
            if closer_name and not any(closer_name.lower() in name.lower() for name in closer_names):
                continue
            items.append({"type": project_type, "record": item})
    items.sort(key=lambda item: (item["record"].get("deal_date") or "", item["record"].get("created_at") or "", item["record"]["id"]), reverse=True)
    result = paginate(items, page, page_size)
    for item in result["items"]:
        fill_effective_remaining(item["record"], item["type"])
    return result


def _resolve_export_range(
    range_type: ExportRangeType | None,
    period: str | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[str | None, str | None, str]:
    if range_type is None:
        today = date.today().isoformat()
        return None, None, f"付费项目_{today}.xlsx"

    if range_type == "day":
        try:
            selected = date.fromisoformat(period or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="请选择正确的导出日期") from exc
        value = selected.isoformat()
        return value, value, f"付费项目_{value}.xlsx"

    if range_type == "month":
        try:
            selected = datetime.strptime(period or "", "%Y-%m").date()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="请选择正确的导出月份") from exc
        next_month = (
            date(selected.year + 1, 1, 1)
            if selected.month == 12
            else date(selected.year, selected.month + 1, 1)
        )
        last_day = date.fromordinal(next_month.toordinal() - 1)
        return selected.isoformat(), last_day.isoformat(), f"付费项目_{period}.xlsx"

    if range_type == "year":
        try:
            selected_year = int(period or "")
            first_day = date(selected_year, 1, 1)
            last_day = date(selected_year, 12, 31)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="请选择正确的导出年份") from exc
        return first_day.isoformat(), last_day.isoformat(), f"付费项目_{selected_year}年.xlsx"

    try:
        first_day = date.fromisoformat(date_from or "")
        last_day = date.fromisoformat(date_to or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="请选择完整的开始日期和结束日期") from exc
    if first_day > last_day:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    return (
        first_day.isoformat(),
        last_day.isoformat(),
        f"付费项目_{first_day.isoformat()}至{last_day.isoformat()}.xlsx",
    )


@router.get("/export")
def export_payment_records(
    request: Request,
    range_type: ExportRangeType | None = None,
    period: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    user_role = getattr(request.state, "user_role", "")
    if user_role in {"", "customer", "system"}:
        raise HTTPException(status_code=403, detail="无权导出付费记录")
    if user_role != "超级管理员":
        page_permissions = position_permission_service.get_permissions(get_request_roles(request))
        if "payment" not in page_permissions:
            raise HTTPException(status_code=403, detail="无付费项目页面权限")
    customer_access_service.require_transaction_access(request, detail=True)
    visible_customer_ids = customer_access_service.visible_customer_ids(
        request,
        customer_service.list_all_customers(),
    )

    resolved_from, resolved_to, filename = _resolve_export_range(
        range_type,
        period,
        date_from,
        date_to,
    )
    output, record_count = payment_export_service.build_payment_export(
        user_role,
        resolved_from,
        resolved_to,
        allowed_customer_ids=visible_customer_ids,
    )
    if record_count == 0:
        raise HTTPException(status_code=404, detail="所选时间范围内暂无付费记录")
    disposition = (
        f'attachment; filename="payment_records.xlsx"; '
        f"filename*=UTF-8''{quote(filename)}"
    )
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": disposition,
            "X-Export-Count": str(record_count),
        },
    )
