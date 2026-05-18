from fastapi import APIRouter, HTTPException

from app.models.visit import VisitRecordCreate
from app.services import visit_service
from app.services.customer_service import get_customer

router = APIRouter(prefix="/api/visits", tags=["visits"])


def _fill_member_type(record):
    """从客户信息实时填充会员身份"""
    data = record.model_dump(mode="json")
    customer = get_customer(record.customer_id)
    data["member_type"] = customer.member_type if customer else ""
    return data


@router.get("")
async def list_visits(date: str = None, customer_id: str = None):
    records = visit_service.list_visits(date, customer_id)
    return [_fill_member_type(r) for r in records]


@router.get("/search-customers")
async def search_customers(q: str = ""):
    return visit_service.search_customers(q)


@router.get("/{visit_id}")
async def get_visit(visit_id: str):
    record = visit_service.get_visit(visit_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return _fill_member_type(record)


@router.post("")
async def create_visit(data: VisitRecordCreate):
    try:
        record = visit_service.create_visit(data)
        return _fill_member_type(record)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{visit_id}")
async def update_visit(visit_id: str, data: dict):
    record = visit_service.update_visit(visit_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return _fill_member_type(record)


@router.delete("/{visit_id}")
async def delete_visit(visit_id: str):
    if not visit_service.delete_visit(visit_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
