from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import emotional_release_session_service
from app.models.emotional_release_session import EmotionalReleaseSessionCreate
from app.services.customer_service import list_customers

router = APIRouter(prefix="/api/emotional-release-sessions", tags=["emotional-release-sessions"])


def _fill_ers_names(sessions: list) -> list:
    customers = list_customers()
    cmap = {c.id: c for c in customers}

    def get_name(cid: str) -> str:
        if not cid:
            return ""
        c = cmap.get(cid)
        return c.nickname if c else ""

    for s in sessions:
        for field in ("owner_name", "host_name"):
            id_field = field.replace("_name", "_id")
            actual = get_name(getattr(s, id_field, ""))
            if getattr(s, field, "") != actual:
                setattr(s, field, actual)
    return sessions


@router.get("")
def list_sessions(date: str = "", page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = emotional_release_session_service.list_sessions(date or None)
    items = _fill_ers_names(items)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_session(data: EmotionalReleaseSessionCreate):
    return emotional_release_session_service.create_session(data)


@router.patch("/{session_id}")
def update_session(session_id: str, data: dict):
    try:
        session, warnings = emotional_release_session_service.update_session(session_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not session:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")
    result = session.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.delete("/{session_id}")
def delete_session(session_id: str):
    if not emotional_release_session_service.delete_session(session_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return emotional_release_session_service.search_customers(q)
