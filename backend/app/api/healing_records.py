from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.healing_record import HealingRecordCreate, HealingRecordUpdate
from app.services import customer_access_service, customer_service, healing_record_service
from app.utils.pagination import paginate
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/healing-records", tags=["healing-records"])


def _require_follow_up_access(request: Request, customer_id: str) -> None:
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    role = get_request_roles(request)
    if not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail="没有查看该客户的权限")
    if not customer_access_service.can_view_detail_tab(role, "follow_up"):
        raise HTTPException(status_code=403, detail="没有查看跟进点的权限")


@router.get("")
def list_records(
    request: Request,
    customer_id: Optional[str] = Query(None),
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    if customer_id:
        _require_follow_up_access(request, customer_id)
        items = healing_record_service.list_records(customer_id)
    else:
        role = get_request_roles(request)
        if not customer_access_service.can_view_detail_tab(role, "follow_up"):
            raise HTTPException(status_code=403, detail="没有查看跟进点的权限")
        visible_ids = customer_access_service.visible_customer_ids(request, customer_service.list_customers())
        items = [record for record in healing_record_service.list_records() if record.customer_id in visible_ids]
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_record(data: HealingRecordCreate, request: Request):
    _require_follow_up_access(request, data.customer_id)
    return healing_record_service.create_record(data)


@router.get("/by-customer-date")
def get_by_customer_date(request: Request, customer_id: str = Query(...), date: str = Query(...)):
    _require_follow_up_access(request, customer_id)
    record = healing_record_service.get_by_customer_date(customer_id, date)
    return record


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    visible_ids = customer_access_service.visible_customer_ids(request, customer_service.list_customers())
    return [item for item in healing_record_service.search_customers(q) if item["id"] in visible_ids]


@router.get("/{record_id}")
def get_record(record_id: str, request: Request):
    record = healing_record_service.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    _require_follow_up_access(request, record.customer_id)
    return record


@router.patch("/{record_id}")
def update_record(record_id: str, data: HealingRecordUpdate, request: Request):
    existing = healing_record_service.get_record(record_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    _require_follow_up_access(request, existing.customer_id)
    if data.customer_id and data.customer_id != existing.customer_id:
        _require_follow_up_access(request, data.customer_id)
    record = healing_record_service.update_record(record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@router.delete("/{record_id}")
def delete_record(record_id: str, request: Request):
    record = healing_record_service.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    _require_follow_up_access(request, record.customer_id)
    if not healing_record_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
