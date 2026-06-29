from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.services import project_deduction_service
from app.models.project_deduction import ProjectDeductionCreate
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/project-deductions", tags=["project-deductions"])


@router.get("")
def list_deductions(customer_id: str | None = Query(None), nickname: str | None = Query(None), project_type: str | None = Query(None), page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = [d.model_dump(mode="json") for d in project_deduction_service.list_deductions(customer_id, nickname, project_type)]
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_deduction(data: ProjectDeductionCreate):
    try:
        return project_deduction_service.create_deduction(data).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class DeductionUpdate(BaseModel):
    count: int
    operator_name: str = ""


@router.patch("/{deduction_id}")
def update_deduction(deduction_id: str, data: DeductionUpdate):
    try:
        return project_deduction_service.update_deduction(deduction_id, data.count, data.operator_name).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{deduction_id}")
def delete_deduction(deduction_id: str):
    try:
        project_deduction_service.delete_deduction(deduction_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/available-items")
def get_available_items(customer_id: str, project_type: str):
    return project_deduction_service.get_available_items(customer_id, project_type)


class AutoDeductRequest(BaseModel):
    nickname: str
    project_type: str
    count: int = 1
    operator_name: str = ""
    name_filter: str = ""


@router.post("/auto")
def auto_deduct(data: AutoDeductRequest):
    try:
        return project_deduction_service.auto_deduct(
            data.nickname, data.project_type, data.count, data.operator_name, data.name_filter
        ).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
