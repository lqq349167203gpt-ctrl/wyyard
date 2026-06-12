import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.group_case_session import GroupCaseSession, GroupCaseSessionCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service, group_case_service

FILENAME = "group_case_sessions.json"
_sessions: Dict[str, GroupCaseSession] = {}


def _load():
    global _sessions
    data = load_data(FILENAME)
    _sessions = {}
    for k, v in data.items():
        _sessions[k] = GroupCaseSession(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _sessions.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _sessions.items()}
        save_data(FILENAME, data)


_load()


def list_sessions(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[GroupCaseSession]:
    sessions = [v for v in _sessions.values() if not v.is_deleted]
    if date:
        sessions = [s for s in sessions if s.date == date]
    if start_date:
        sessions = [s for s in sessions if s.date >= start_date]
    if end_date:
        sessions = [s for s in sessions if s.date <= end_date]
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return sessions


def get_session(session_id: str) -> Optional[GroupCaseSession]:
    session = _sessions.get(session_id)
    if session and session.is_deleted:
        return None
    return session


def create_session(data: GroupCaseSessionCreate) -> GroupCaseSession:
    now = datetime.now(timezone.utc)
    session = GroupCaseSession(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _sessions[session.id] = session
    _save(session.id)
    return session


def update_session(session_id: str, data: dict):
    """返回 (session, []) 成功, (None, []) 未找到"""
    from app.services import visit_service

    session = _sessions.get(session_id)
    if not session:
        return None, []

    # 自动过滤不在到场名单中的人员
    if "participant_ids" in data:
        visits = visit_service.list_visits(session.date)
        visit_ids = {v.customer_id for v in visits}
        data["participant_ids"] = [pid for pid in data["participant_ids"] if pid in visit_ids]

    for key, value in data.items():
        if hasattr(session, key) and key not in ("id", "created_at"):
            setattr(session, key, value)
    session.updated_at = datetime.now(timezone.utc)
    _sessions[session_id] = session
    _save(session_id)
    return session, []


def _get_chargeable_ids(session) -> set:
    """需要扣费的人员：参与者 + 主持人（不含案主、成就君）—— 供 visit 到店扣费使用"""
    ids = set(session.participant_ids)
    if session.host_id:
        ids.add(session.host_id)
    ids.discard(session.owner_id)
    if session.achiever_id:
        ids.discard(session.achiever_id)
    return ids


def delete_session(session_id: str) -> bool:
    session = _sessions.get(session_id)
    if not session:
        return False
    session.is_deleted = True
    session.deleted_at = datetime.now(timezone.utc)
    _save()
    return True



def search_customers(keyword: str) -> list:
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if not keyword or keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
                "remaining": get_remaining_count(c.id),
            })
    return results


def get_remaining_count(customer_id: str) -> int:
    """计算某用户的觉醒游戏剩余次数（所有已创建的场次均计入已用）"""
    cases = group_case_service.list_cases()
    total_purchased = sum(c.purchase_count for c in cases if c.customer_id == customer_id)
    used = sum(1 for s in _sessions.values() if s.owner_id == customer_id and not s.is_deleted)
    from app.services import project_deduction_service
    manual_deductions = project_deduction_service.get_deduction_total(customer_id, "group-cases")
    return total_purchased - used - manual_deductions
