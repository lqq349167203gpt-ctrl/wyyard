from fastapi import APIRouter, HTTPException, Query, Request

from app.models.expense import ExpenseCreate, ExpenseUpdate
from app.services import expense_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def _operator(request: Request) -> str:
    return getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""


@router.get("")
def list_expenses(
    date_from: str = Query("", max_length=10),
    date_to: str = Query("", max_length=10),
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    items = [
        item.model_dump(mode="json")
        for item in expense_service.list_expenses(date_from, date_to)
    ]
    if page is not None:
        return paginate(items, page, page_size or 20)
    return items


@router.get("/{expense_id}")
def get_expense(expense_id: str):
    item = expense_service.get_expense(expense_id)
    if not item:
        raise HTTPException(status_code=404, detail="支出记录不存在")
    return item.model_dump(mode="json")


@router.post("")
def create_expense(data: ExpenseCreate, request: Request):
    return expense_service.create_expense(data, _operator(request)).model_dump(mode="json")


@router.put("/{expense_id}")
def update_expense(expense_id: str, data: ExpenseUpdate, request: Request):
    try:
        return expense_service.update_expense(expense_id, data, _operator(request)).model_dump(mode="json")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/{expense_id}")
def delete_expense(expense_id: str, request: Request):
    try:
        expense_service.delete_expense(expense_id, _operator(request))
        return {"message": "删除成功"}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
