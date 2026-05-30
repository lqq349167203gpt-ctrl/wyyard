from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import internal_course_session_service
from app.models.internal_course_session import InternalCourseSessionCreate

router = APIRouter(prefix="/api/internal-course-sessions", tags=["internal-course-sessions"])


@router.get("")
def list_sessions(date: str = "", page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = internal_course_session_service.list_sessions(date or None)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_session(data: InternalCourseSessionCreate):
    return internal_course_session_service.create_session(data)


@router.patch("/{session_id}")
def update_session(session_id: str, data: dict):
    session = internal_course_session_service.update_session(session_id, data)
    if not session:
        raise HTTPException(status_code=404, detail="记录不存在")
    return session


@router.delete("/{session_id}")
def delete_session(session_id: str):
    if not internal_course_session_service.delete_session(session_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return internal_course_session_service.search_customers(q)
