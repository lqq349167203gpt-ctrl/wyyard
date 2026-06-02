import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.internal_course_session import InternalCourseSession, InternalCourseSessionCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "internal_course_sessions.json"
_sessions: Dict[str, InternalCourseSession] = {}


def _load():
    global _sessions
    data = load_data(FILENAME)
    _sessions = {}
    for k, v in data.items():
        _sessions[k] = InternalCourseSession(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _sessions.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _sessions.items()}
        save_data(FILENAME, data)


_load()


def list_sessions(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[InternalCourseSession]:
    sessions = [v for v in _sessions.values() if not v.is_deleted]
    if date:
        sessions = [s for s in sessions if s.date == date]
    if start_date:
        sessions = [s for s in sessions if s.date >= start_date]
    if end_date:
        sessions = [s for s in sessions if s.date <= end_date]
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return sessions


def get_session(session_id: str) -> Optional[InternalCourseSession]:
    session = _sessions.get(session_id)
    if session and session.is_deleted:
        return None
    return session


def create_session(data: InternalCourseSessionCreate) -> InternalCourseSession:
    now = datetime.now(timezone.utc)
    session = InternalCourseSession(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _sessions[session.id] = session
    _save(session.id)
    return session


def update_session(session_id: str, data: dict) -> Optional[InternalCourseSession]:
    from app.services import visit_service

    session = _sessions.get(session_id)
    if not session:
        return None

    # 校验 participant_ids 必须在当日到场名单中
    if "participant_ids" in data:
        visits = visit_service.list_visits(session.date)
        visit_ids = {v.customer_id for v in visits}
        for pid in data["participant_ids"]:
            if pid not in visit_ids:
                raise ValueError(f"成员 {pid} 不在 {session.date} 的到场名单中")

    for key, value in data.items():
        if hasattr(session, key) and key not in ("id", "created_at"):
            setattr(session, key, value)
    session.updated_at = datetime.now(timezone.utc)
    _sessions[session_id] = session
    _save(session_id)
    return session


def delete_session(session_id: str) -> bool:
    session = _sessions.get(session_id)
    if not session:
        return False
    session.is_deleted = True
    session.deleted_at = datetime.now(timezone.utc)
    _save(session_id)
    return True


def search_customers(keyword: str) -> list:
    if not keyword:
        return []
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
            })
    return results
