from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.tea_guest_consumption import TeaGuestConsumptionCreate, TeaGuestConsumptionUpdate
from app.services import tea_guest_consumption_service
from app.utils.pagination import paginate

PAGE_PERMISSION = "tea-guest-consumption-records"
PAYMENT_METHOD_PATTERN = "^(|美团|支付宝|微信|抖音)$"
router = APIRouter(
    prefix="/api/tea-guest/consumption-records",
    tags=["tea-guest-consumption-records"],
    dependencies=[Depends(require_page_permission(PAGE_PERMISSION))],
)


def _operator(request: Request) -> str:
    return getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""


def _format_log_content(action: str, item) -> str:
    time_text = item.consumption_time.replace("T", " ")
    return (
        f"{action}消费记录：{time_text}｜茶客数量：{item.guest_count}人｜"
        f"单价：¥{item.unit_price:,.2f}｜总金额：¥{item.total_amount:,.2f}｜"
        f"支付方式：{item.payment_method}"
    )


@router.get("")
def list_records(
    date_from: str = Query("", max_length=10),
    date_to: str = Query("", max_length=10),
    payment_method: str = Query("", pattern=PAYMENT_METHOD_PATTERN),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    items = [
        item.model_dump(mode="json")
        for item in tea_guest_consumption_service.list_records(date_from, date_to, payment_method)
    ]
    return paginate(items, page, page_size)


@router.get("/{record_id}")
def get_record(record_id: str):
    item = tea_guest_consumption_service.get_record(record_id)
    if not item:
        raise HTTPException(status_code=404, detail="消费记录不存在")
    return item.model_dump(mode="json")


@router.post("")
def create_record(data: TeaGuestConsumptionCreate, request: Request):
    item = tea_guest_consumption_service.create_record(data, _operator(request))
    item_data = item.model_dump(mode="json")
    request.state.operation_log_context = {
        "entity_id": item.id,
        "after_data": item_data,
        "content": _format_log_content("新增", item),
    }
    return item_data


@router.put("/{record_id}")
def update_record(record_id: str, data: TeaGuestConsumptionUpdate, request: Request):
    before = tea_guest_consumption_service.get_record(record_id)
    if not before:
        raise HTTPException(status_code=404, detail="消费记录不存在")
    try:
        item = tea_guest_consumption_service.update_record(record_id, data, _operator(request))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    request.state.operation_log_context = {
        "entity_id": item.id,
        "before_data": before.model_dump(mode="json"),
        "after_data": item.model_dump(mode="json"),
        "content": _format_log_content("修改", item),
    }
    return item.model_dump(mode="json")


@router.delete("/{record_id}")
def delete_record(record_id: str, request: Request):
    before = tea_guest_consumption_service.get_record(record_id)
    if not before:
        raise HTTPException(status_code=404, detail="消费记录不存在")
    try:
        tea_guest_consumption_service.delete_record(record_id, _operator(request))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    request.state.operation_log_context = {
        "entity_id": record_id,
        "before_data": before.model_dump(mode="json"),
        "after_data": None,
        "content": _format_log_content("删除", before),
    }
    return {"message": "删除成功"}
