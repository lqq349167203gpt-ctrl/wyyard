from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.utils.pagination import paginate
from app.services import group_case_service
from app.models.group_case import GroupCaseCreate

router = APIRouter(prefix="/api/group-cases", tags=["group-cases"])


@router.get("")
def list_cases(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None)):
    items = group_case_service.list_cases()
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items = [i for i in items if i.get("customer_id") in allowed]
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_case(data: GroupCaseCreate):
    return group_case_service.create_case(data)


@router.patch("/{case_id}")
def update_case(case_id: str, data: dict):
    case = group_case_service.update_case(case_id, data)
    if not case:
        raise HTTPException(status_code=404, detail="记录不存在")
    return case


@router.delete("/{case_id}")
def delete_case(case_id: str):
    success, message = group_case_service.delete_case(case_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return group_case_service.search_customers(q)
