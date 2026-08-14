from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.tea_guest_expense import (
    TeaGuestExpenseCreate,
    TeaGuestExpenseTypeCreate,
    TeaGuestExpenseTypeUpdate,
    TeaGuestExpenseUpdate,
)
from app.services import tea_guest_expense_service
from app.utils.pagination import paginate

PAGE_PERMISSION = "tea-guest-expenses"
router = APIRouter(
    prefix="/api/tea-guest/expenses",
    tags=["tea-guest-expenses"],
    dependencies=[Depends(require_page_permission(PAGE_PERMISSION))],
)


def _operator(request: Request) -> str:
    return getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""


def _log_content(action: str, item) -> str:
    time_text = item.expense_time.replace("T", " ")
    category = "管理成本" if item.cost_category == "management" else "运营成本"
    return (
        f"{action}支出：{time_text}｜{category}｜类型：{item.expense_type}｜"
        f"支出项：{item.purchase_content}｜金额：¥{item.amount:,.2f}"
    )


@router.get("")
def list_expenses(
    date_from: str = Query("", max_length=10),
    date_to: str = Query("", max_length=10),
    cost_category: str = Query("", pattern="^(|management|operation)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    items = [
        item.model_dump(mode="json")
        for item in tea_guest_expense_service.list_expenses(date_from, date_to, cost_category)
    ]
    return paginate(items, page, page_size)


@router.get("/types/list")
def list_expense_types(cost_category: str = Query("", pattern="^(|management|operation)$")):
    return [
        item.model_dump(mode="json")
        for item in tea_guest_expense_service.list_expense_types(cost_category)
    ]


@router.post("/types")
def create_expense_type(data: TeaGuestExpenseTypeCreate):
    try:
        return tea_guest_expense_service.create_expense_type(data).model_dump(mode="json")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/types/{type_id}")
def update_expense_type(type_id: str, data: TeaGuestExpenseTypeUpdate):
    try:
        return tea_guest_expense_service.update_expense_type(type_id, data).model_dump(mode="json")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/types/{type_id}")
def delete_expense_type(type_id: str):
    try:
        tea_guest_expense_service.delete_expense_type(type_id)
        return {"message": "删除成功"}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/{expense_id}")
def get_expense(expense_id: str):
    item = tea_guest_expense_service.get_expense(expense_id)
    if not item:
        raise HTTPException(status_code=404, detail="支出记录不存在")
    return item.model_dump(mode="json")


@router.post("")
def create_expense(data: TeaGuestExpenseCreate, request: Request):
    try:
        item = tea_guest_expense_service.create_expense(data, _operator(request))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    item_data = item.model_dump(mode="json")
    request.state.operation_log_context = {
        "entity_id": item.id,
        "after_data": item_data,
        "content": _log_content("新增", item),
    }
    return item_data


@router.put("/{expense_id}")
def update_expense(expense_id: str, data: TeaGuestExpenseUpdate, request: Request):
    before = tea_guest_expense_service.get_expense(expense_id)
    if not before:
        raise HTTPException(status_code=404, detail="支出记录不存在")
    try:
        item = tea_guest_expense_service.update_expense(expense_id, data, _operator(request))
    except ValueError as error:
        status_code = 404 if str(error) == "支出记录不存在" else 400
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    request.state.operation_log_context = {
        "entity_id": item.id,
        "before_data": before.model_dump(mode="json"),
        "after_data": item.model_dump(mode="json"),
        "content": _log_content("修改", item),
    }
    return item.model_dump(mode="json")


@router.delete("/{expense_id}")
def delete_expense(expense_id: str, request: Request):
    before = tea_guest_expense_service.get_expense(expense_id)
    if not before:
        raise HTTPException(status_code=404, detail="支出记录不存在")
    try:
        tea_guest_expense_service.delete_expense(expense_id, _operator(request))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    request.state.operation_log_context = {
        "entity_id": expense_id,
        "before_data": before.model_dump(mode="json"),
        "after_data": None,
        "content": _log_content("删除", before),
    }
    return {"message": "删除成功"}
