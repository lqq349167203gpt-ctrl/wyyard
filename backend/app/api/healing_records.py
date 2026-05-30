from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services import healing_record_service
from app.models.healing_record import HealingRecordCreate, HealingRecordUpdate
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/healing-records", tags=["healing-records"])


@router.get("")
def list_records(
    customer_id: Optional[str] = Query(None),
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    items = healing_record_service.list_records(customer_id)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_record(data: HealingRecordCreate):
    return healing_record_service.create_record(data)


@router.get("/by-customer-date")
def get_by_customer_date(customer_id: str = Query(...), date: str = Query(...)):
    record = healing_record_service.get_by_customer_date(customer_id, date)
    return record


@router.get("/search-customers")
def search_customers(q: str = ""):
    return healing_record_service.search_customers(q)


@router.get("/{record_id}")
def get_record(record_id: str):
    record = healing_record_service.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@router.patch("/{record_id}")
def update_record(record_id: str, data: HealingRecordUpdate):
    record = healing_record_service.update_record(record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@router.delete("/{record_id}")
def delete_record(record_id: str):
    if not healing_record_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
