import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.energy_knot_session import EnergyKnotSession, EnergyKnotSessionCreate
from app.services.storage import load_data, save_data
from app.services import customer_service, energy_knot_service

FILENAME = "energy_knot_sessions.json"
_sessions: Dict[str, EnergyKnotSession] = {}


def _load():
    global _sessions
    data = load_data(FILENAME)
    _sessions = {}
    for k, v in data.items():
        _sessions[k] = EnergyKnotSession(**v)


def _save():
    data = {k: v.model_dump(mode="json") for k, v in _sessions.items()}
    save_data(FILENAME, data)


_load()


def list_sessions(date: Optional[str] = None) -> List[EnergyKnotSession]:
    sessions = [v for v in _sessions.values() if not v.is_deleted]
    if date:
        sessions = [s for s in sessions if s.date == date]
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return sessions


def get_session(session_id: str) -> Optional[EnergyKnotSession]:
    session = _sessions.get(session_id)
    if session and session.is_deleted:
        return None
    return session


def create_session(data: EnergyKnotSessionCreate) -> EnergyKnotSession:
    now = datetime.now(timezone.utc)
    session = EnergyKnotSession(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _sessions[session.id] = session
    _save()
    return session


def update_session(session_id: str, data: dict) -> Optional[EnergyKnotSession]:
    session = _sessions.get(session_id)
    if not session:
        return None
    for key, value in data.items():
        if hasattr(session, key) and key not in ("id", "created_at"):
            setattr(session, key, value)
    session.updated_at = datetime.now(timezone.utc)
    _sessions[session_id] = session
    _save()
    return session


def delete_session(session_id: str) -> bool:
    session = _sessions.get(session_id)
    if not session:
        return False
    session.is_deleted = True
    session.deleted_at = datetime.now(timezone.utc)
    _save()
    return True


def search_customers(keyword: str) -> list:
    if not keyword:
        return []
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            remaining = get_remaining_count(c.id)
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
                "remaining": remaining,
            })
    return results


def get_remaining_count(customer_id: str) -> int:
    """计算某用户的能量结剩余次数（所有已创建的场次均计入已用）"""
    knots = energy_knot_service.list_knots()
    total_purchased = sum(k.purchase_count for k in knots if k.customer_id == customer_id)
    used = sum(1 for s in _sessions.values() if s.owner_id == customer_id and not s.is_deleted)
    return total_purchased - used
