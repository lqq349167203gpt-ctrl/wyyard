import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.energy_knot_session import EnergyKnotSession, EnergyKnotSessionCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service, energy_knot_service

FILENAME = "energy_knot_sessions.json"
_sessions: Dict[str, EnergyKnotSession] = {}


def _load():
    global _sessions
    data = load_data(FILENAME)
    _sessions = {}
    for k, v in data.items():
        _sessions[k] = EnergyKnotSession(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _sessions.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _sessions.items()}
        save_data(FILENAME, data)


_load()


def list_sessions(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[EnergyKnotSession]:
    sessions = [v for v in _sessions.values() if not v.is_deleted]
    if date:
        sessions = [s for s in sessions if s.date == date]
    if start_date:
        sessions = [s for s in sessions if s.date >= start_date]
    if end_date:
        sessions = [s for s in sessions if s.date <= end_date]
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
    _save(session.id)
    return session


def update_session(session_id: str, data: dict) -> Optional[EnergyKnotSession]:
    from app.services import visit_service

    session = _sessions.get(session_id)
    if not session:
        return None

    # 自动过滤不在到场名单中的人员
    if "host_ids" in data:
        visits = visit_service.list_visits(session.date)
        visit_ids = {v.customer_id for v in visits}
        data["host_ids"] = [hid for hid in data["host_ids"] if hid in visit_ids]

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
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if not keyword or keyword in c.nickname or (c.name and keyword in c.name):
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
    """计算某用户的能量结剩余次数（按部位数扣除）"""
    knots = energy_knot_service.list_knots()
    total_purchased = sum(k.purchase_count for k in knots if k.customer_id == customer_id)
    used = 0
    for s in _sessions.values():
        if s.is_deleted:
            continue
        found_in_desc = False
        try:
            descs = json.loads(s.description or "[]")
            if isinstance(descs, list):
                for d in descs:
                    if isinstance(d, dict) and d.get("id") == customer_id:
                        used += max(1, d.get("count", 1))
                        found_in_desc = True
        except (json.JSONDecodeError, TypeError):
            pass
        if not found_in_desc and s.owner_id == customer_id:
            used += 1
    from app.services import project_deduction_service
    manual_deductions = project_deduction_service.get_deduction_total(customer_id, "energy-knots")
    return total_purchased - used - manual_deductions
