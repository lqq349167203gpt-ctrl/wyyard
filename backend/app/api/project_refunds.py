from fastapi import APIRouter, HTTPException, Query, Request

from app.models.base import StrictBaseModel
from app.models.project_refund import ProjectRefundCreate
from app.services import customer_access_service, project_refund_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/project-refunds", tags=["project-refunds"])


@router.get("")
def list_refunds(request: Request, customer_id: str | None = Query(None), nickname: str | None = Query(None), project_type: str | None = Query(None), page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = [r.model_dump(mode="json") for r in project_refund_service.list_refunds(customer_id, nickname, project_type)]
    items = customer_access_service.filter_record_dicts(request, items)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_refund(data: ProjectRefundCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="退费")
    try:
        return project_refund_service.create_refund(data).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class RefundUpdate(StrictBaseModel):
    refund_amount: float
    updated_by: str = ""


@router.patch("/{refund_id}")
def update_refund(refund_id: str, data: RefundUpdate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = next(
        (item for item in project_refund_service.list_refunds() if item.id == refund_id),
        None,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="退费记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    try:
        return project_refund_service.update_refund(refund_id, data.refund_amount, data.updated_by).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{refund_id}")
def delete_refund(refund_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = next(
        (item for item in project_refund_service.list_refunds() if item.id == refund_id),
        None,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="退费记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    try:
        project_refund_service.delete_refund(refund_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/available-items")
def get_available_items(customer_id: str, project_type: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, customer_id)
    return project_refund_service.get_available_items(customer_id, project_type)
