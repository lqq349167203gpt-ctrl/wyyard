from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.services import project_refund_service
from app.models.project_refund import ProjectRefundCreate
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/project-refunds", tags=["project-refunds"])


@router.get("")
def list_refunds(customer_id: str | None = Query(None), nickname: str | None = Query(None), project_type: str | None = Query(None), page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = [r.model_dump(mode="json") for r in project_refund_service.list_refunds(customer_id, nickname, project_type)]
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_refund(data: ProjectRefundCreate):
    try:
        return project_refund_service.create_refund(data).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class RefundUpdate(BaseModel):
    refund_amount: float
    updated_by: str = ""


@router.patch("/{refund_id}")
def update_refund(refund_id: str, data: RefundUpdate):
    try:
        return project_refund_service.update_refund(refund_id, data.refund_amount, data.updated_by).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{refund_id}")
def delete_refund(refund_id: str):
    try:
        project_refund_service.delete_refund(refund_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/available-items")
def get_available_items(customer_id: str, project_type: str):
    return project_refund_service.get_available_items(customer_id, project_type)
