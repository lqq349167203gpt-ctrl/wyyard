from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import internal_course_session_service
from app.models.internal_course_session import InternalCourseSessionCreate
from app.services.customer_service import list_customers

router = APIRouter(prefix="/api/internal-course-sessions", tags=["internal-course-sessions"])


def _fill_ics_names(sessions: list) -> list:
    customers = list_customers()
    cmap = {c.id: c for c in customers}

    def get_name(cid: str) -> str:
        if not cid:
            return ""
        c = cmap.get(cid)
        return c.nickname if c else ""

    for s in sessions:
        actual_hosts = [get_name(hid) for hid in (getattr(s, "host_ids", []) or [])]
        if getattr(s, "host_names", []) != actual_hosts:
            setattr(s, "host_names", actual_hosts)
    return sessions


@router.get("")
def list_sessions(date: str = "", page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = internal_course_session_service.list_sessions(date or None)
    items = _fill_ics_names(items)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_session(data: InternalCourseSessionCreate):
    return internal_course_session_service.create_session(data)


@router.patch("/{session_id}")
def update_session(session_id: str, data: dict):
    try:
        session = internal_course_session_service.update_session(session_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
