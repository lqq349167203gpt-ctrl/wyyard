from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.utils.pagination import paginate
from app.services import group_case_session_service
from app.models.group_case_session import GroupCaseSessionCreate

router = APIRouter(prefix="/api/group-case-sessions", tags=["group-case-sessions"])


@router.get("")
def list_sessions(date: Optional[str] = None, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = group_case_session_service.list_sessions(date)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_session(data: GroupCaseSessionCreate):
    return group_case_session_service.create_session(data)


@router.patch("/{session_id}")
def update_session(session_id: str, data: dict):
    session, warnings = group_case_session_service.update_session(session_id, data)
    if not session:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")
    result = session.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.delete("/{session_id}")
def delete_session(session_id: str):
    if not group_case_session_service.delete_session(session_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return group_case_session_service.search_customers(q)
