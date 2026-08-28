from fastapi import APIRouter, HTTPException, Query, Request

from app.models.base import StrictBaseModel
from app.models.project_deduction import ProjectDeductionCreate
from app.services import customer_access_service, customer_service, project_deduction_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/project-deductions", tags=["project-deductions"])


@router.get("")
def list_deductions(request: Request, customer_id: str | None = Query(None), nickname: str | None = Query(None), project_type: str | None = Query(None), card_type: str | None = Query(None), page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = [d.model_dump(mode="json") for d in project_deduction_service.list_deductions(customer_id, nickname, project_type)]
    items = customer_access_service.filter_record_dicts(request, items)
    if card_type:
        items = [i for i in items if i.get("project_name") == card_type]
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_deduction(data: ProjectDeductionCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="销卡")
    try:
        return project_deduction_service.create_deduction(data).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class DeductionUpdate(StrictBaseModel):
    count: int
    reason: str | None = None
    updated_by: str = ""


@router.patch("/{deduction_id}")
def update_deduction(deduction_id: str, data: DeductionUpdate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = next(
        (item for item in project_deduction_service.list_deductions() if item.id == deduction_id),
        None,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="销卡记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    try:
        return project_deduction_service.update_deduction(
            deduction_id,
            data.count,
            data.updated_by,
            data.reason,
        ).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{deduction_id}")
def delete_deduction(deduction_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = next(
        (item for item in project_deduction_service.list_deductions() if item.id == deduction_id),
        None,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="销卡记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    try:
        project_deduction_service.delete_deduction(deduction_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/available-items")
def get_available_items(customer_id: str, project_type: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, customer_id)
    return project_deduction_service.get_available_items(customer_id, project_type)


class AutoDeductRequest(StrictBaseModel):
    nickname: str
    project_type: str
    count: int = 1
    created_by: str = ""
    name_filter: str = ""


@router.post("/auto")
def auto_deduct(data: AutoDeductRequest, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer = customer_service.get_by_nickname(data.nickname)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    customer_access_service.require_customer_scope(request, customer.id, action="销卡")
    try:
        return project_deduction_service.auto_deduct(
            data.nickname,
            data.project_type,
            data.count,
            data.created_by,
            data.name_filter,
            "Excel批量导入销卡",
        ).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
