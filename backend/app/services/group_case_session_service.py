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


def _deduct_for_session(session):
    """为新创建的活动扣费"""
    from app.services import membership_card_service
    chargeable = _get_chargeable_ids(session)
    activity_key = f"gcs:{session.id}"
    for cid in chargeable:
        membership_card_service.deduct_for_activity(cid, activity_key)


def _restore_for_session(session):
    """为删除的活动退费"""
    from app.services import membership_card_service
    chargeable = _get_chargeable_ids(session)
    activity_key = f"gcs:{session.id}"
    for cid in chargeable:
        membership_card_service.restore_for_activity(cid, activity_key)


def _sync_deduction(session, old_chargeable, new_chargeable):
    """同步扣费：为新增人员扣费，为移除人员退费"""
    from app.services import membership_card_service
    activity_key = f"gcs:{session.id}"
    for cid in old_chargeable - new_chargeable:
        membership_card_service.restore_for_activity(cid, activity_key)
    for cid in new_chargeable - old_chargeable:
        membership_card_service.deduct_for_activity(cid, activity_key)


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

    # 获取旧的可扣费人员
    old_chargeable = _get_chargeable_ids(session)

    # 自动过滤不在到场名单中的人员
    if "participant_ids" in data:
        visits = visit_service.list_visits(session.date)
        visit_ids = {v.customer_id for v in visits}
        data["participant_ids"] = [pid for pid in data["participant_ids"] if pid in visit_ids]

    for key, value in data.items():
        if hasattr(session, key) and key not in ("id", "created_at", "created_by"):
            setattr(session, key, value)

    # 案主不能同时是参与者
    if session.owner_id:
        session.participant_ids = [pid for pid in session.participant_ids if pid != session.owner_id]

    session.updated_at = datetime.now(timezone.utc)
    _sessions[session_id] = session
    _save(session_id)

    # 同步扣费
    new_chargeable = _get_chargeable_ids(session)
    _sync_deduction(session, old_chargeable, new_chargeable)

    return session, []


def _get_chargeable_ids(session) -> set:
    """通过会员卡扣费的人员：参与者 + 老师
    - 案主：通过付费项目页面购买次数，独立扣费
    - 参与者/老师：通过会员卡扣费
    """
    ids = set(session.participant_ids)
    ids.discard(session.owner_id)  # 案主走付费项目
    return ids


def delete_session(session_id: str) -> bool:
    session = _sessions.get(session_id)
    if not session:
        return False
    _restore_for_session(session)
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
                "positions": [p.value if hasattr(p, 'value') else p for p in (c.positions or [])],
            })
    return results


def get_remaining_count(customer_id: str) -> int:
    """计算某用户的觉醒游戏剩余次数（仅统计案主使用，成就君不限次，参与者走会员卡）"""
    cases = group_case_service.list_cases()
    total_purchased = sum(c.purchase_count for c in cases if c.customer_id == customer_id)
    # 仅统计案主的使用次数
    used = sum(1 for s in _sessions.values() if not s.is_deleted and s.owner_id == customer_id)
    from app.services import project_deduction_service
    manual_deductions = project_deduction_service.get_deduction_total(customer_id, "group-cases")
    return total_purchased - used - manual_deductions
