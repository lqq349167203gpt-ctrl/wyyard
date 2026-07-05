from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import other_project_service, other_project_deduction_service
from app.models.other_project import OtherProjectCreate
from app.models.other_project_deduction import OtherProjectDeductionCreate

router = APIRouter(prefix="/api/other-projects", tags=["other-projects"])


@router.get("")
def list_projects(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    items = [i.model_dump(mode="json") for i in other_project_service.list_projects()]
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


@router.get("/{project_id}")
def get_project(project_id: str):
    project = other_project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="记录不存在")
    return project


@router.post("")
def create_project(data: OtherProjectCreate):
    return other_project_service.create_project(data)


@router.patch("/{project_id}")
def update_project(project_id: str, data: dict):
    # 次数字段由销卡流水写，禁止外部 PATCH 直接修改（恒等式：剩余 = 总 - 销卡流水）
    forbidden = {"remaining_count"}
    violated = forbidden & set(data.keys())
    if violated:
        raise HTTPException(
            status_code=400,
            detail=f"不允许直接修改次数字段：{','.join(sorted(violated))}。请通过销卡流水操作。",
        )
    project = other_project_service.update_project(project_id, data)
    if not project:
        raise HTTPException(status_code=404, detail="记录不存在")
    return project


@router.delete("/{project_id}")
def delete_project(project_id: str):
    if not other_project_service.delete_project(project_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return other_project_service.search_customers(q)


@router.get("/deductions")
def list_deductions(customer_id: str | None = Query(None)):
    return [d.model_dump(mode="json") for d in other_project_deduction_service.list_deductions(customer_id)]


@router.post("/deductions")
def create_deduction(data: OtherProjectDeductionCreate):
    try:
        return other_project_deduction_service.create_deduction(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{customer_id}/available-projects")
def get_available_projects(customer_id: str):
    return other_project_deduction_service.get_available_projects(customer_id)
