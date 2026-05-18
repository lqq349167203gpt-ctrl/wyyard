from fastapi import APIRouter, HTTPException
from app.services import emotional_release_session_service
from app.models.emotional_release_session import EmotionalReleaseSessionCreate

router = APIRouter(prefix="/api/emotional-release-sessions", tags=["emotional-release-sessions"])


@router.get("")
def list_sessions(date: str = ""):
    return emotional_release_session_service.list_sessions(date or None)


@router.post("")
def create_session(data: EmotionalReleaseSessionCreate):
    return emotional_release_session_service.create_session(data)


@router.patch("/{session_id}")
def update_session(session_id: str, data: dict):
    session, warnings = emotional_release_session_service.update_session(session_id, data)
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
