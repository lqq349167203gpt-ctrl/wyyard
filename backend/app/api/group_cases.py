from fastapi import APIRouter, HTTPException
from typing import Optional
from app.services import group_case_service
from app.models.group_case import GroupCaseCreate

router = APIRouter(prefix="/api/group-cases", tags=["group-cases"])


@router.get("")
def list_cases():
    return group_case_service.list_cases()


@router.post("")
def create_case(data: GroupCaseCreate):
    return group_case_service.create_case(data)


@router.patch("/{case_id}")
def update_case(case_id: str, data: dict):
    case = group_case_service.update_case(case_id, data)
    if not case:
        raise HTTPException(status_code=404, detail="记录不存在")
    return case


@router.delete("/{case_id}")
def delete_case(case_id: str):
    success, message = group_case_service.delete_case(case_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return group_case_service.search_customers(q)
