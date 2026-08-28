from fastapi import APIRouter, HTTPException, Query, Request

from app.models.other_project import OtherProjectCreate
from app.models.other_project_deduction import OtherProjectDeductionCreate
from app.services import customer_access_service, other_project_deduction_service, other_project_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/other-projects", tags=["other-projects"])


@router.get("")
def list_projects(request: Request, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    projects = other_project_service.list_projects()
    items = []
    for p in projects:
        d = p.model_dump(mode="json")
        d["remaining_count"] = other_project_service.get_effective_remaining(p.id)
        items.append(d)
    items = customer_access_service.filter_record_dicts(request, items)
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items = [i for i in items if i.get("customer_id") in allowed]
    if nickname:
        kw = nickname.lower()
        items = [i for i in items if kw in (i.get("nickname") or "").lower()]
    if closer_name:
        kw = closer_name.lower()
        items = [i for i in items if kw in (i.get("closer_name") or "").lower() or any(kw in (c.get("name") or "").lower() for c in (i.get("closers") or []))]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    customer_access_service.require_transaction_access(request, detail=True)
    return customer_access_service.filter_customer_search_results(
        request, other_project_service.search_customers(q)
    )


@router.get("/deductions")
def list_deductions(request: Request, customer_id: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = [
        deduction.model_dump(mode="json")
        for deduction in other_project_deduction_service.list_deductions(customer_id)
    ]
    return customer_access_service.filter_record_dicts(request, items)


@router.get("/{project_id}")
def get_project(project_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    project = other_project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, project.customer_id)
    d = project.model_dump(mode="json")
    d["remaining_count"] = other_project_service.get_effective_remaining(project_id)
    return d


@router.post("")
def create_project(data: OtherProjectCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    return other_project_service.create_project(data)


@router.patch("/{project_id}")
def update_project(project_id: str, data: dict, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = other_project_service.get_project(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    if data.get("customer_id") and data["customer_id"] != existing.customer_id:
        customer_access_service.require_customer_scope(request, data["customer_id"], action="新增付费项目到")
    project = other_project_service.update_project(project_id, data)
    if not project:
        raise HTTPException(status_code=404, detail="记录不存在")
    return project


@router.delete("/{project_id}")
def delete_project(project_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = other_project_service.get_project(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    if not other_project_service.delete_project(project_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.post("/deductions")
def create_deduction(data: OtherProjectDeductionCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    project = other_project_service.get_project(data.other_project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.customer_id != data.customer_id:
        raise HTTPException(status_code=400, detail="销卡项目与客户不匹配")
    customer_access_service.require_customer_scope(request, project.customer_id, action="销卡")
    try:
        return other_project_deduction_service.create_deduction(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{customer_id}/available-projects")
def get_available_projects(customer_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, customer_id)
    return other_project_deduction_service.get_available_projects(customer_id)
