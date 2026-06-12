from fastapi import APIRouter, HTTPException, Query
from app.services import project_deduction_service
from app.models.project_deduction import ProjectDeductionCreate

router = APIRouter(prefix="/api/project-deductions", tags=["project-deductions"])


@router.get("")
def list_deductions(customer_id: str | None = Query(None)):
    return [d.model_dump(mode="json") for d in project_deduction_service.list_deductions(customer_id)]


@router.post("")
def create_deduction(data: ProjectDeductionCreate):
    try:
        return project_deduction_service.create_deduction(data).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/available-items")
def get_available_items(customer_id: str, project_type: str):
    return project_deduction_service.get_available_items(customer_id, project_type)
