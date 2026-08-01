import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.energy_knot_session import EnergyKnotSession, EnergyKnotSessionCreate
from app.services import customer_service, energy_knot_service
from app.services.storage import load_data, save_data, save_item

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


def _get_chargeable_ids(session) -> set:
    """能量结不产生参与者会员卡扣费；案主按专项次数单独计算。"""
    return set()


def _deduct_for_session(session):
    """为新创建的活动扣费"""
    from app.services import membership_card_service
    chargeable = membership_card_service.filter_arrived_customer_ids(
        session.date,
        _get_chargeable_ids(session),
    )
    activity_key = f"eks:{session.id}"
    deduction_count = membership_card_service.get_activity_deduction_count(session)
    with membership_card_service._deduct_lock:
        for cid in chargeable:
            membership_card_service._do_sync_activity_count(cid, activity_key, deduction_count)
        membership_card_service._save_deductions()
        membership_card_service._save_debts()


def _restore_for_session(session):
    """为删除的活动退费"""
    from app.services import membership_card_service
    chargeable = _get_chargeable_ids(session)
    activity_key = f"eks:{session.id}"
    with membership_card_service._deduct_lock:
        for cid in chargeable:
            membership_card_service._do_sync_activity_count(cid, activity_key, 0)
        membership_card_service._save_deductions()
        membership_card_service._save_debts()


def _sync_deduction(session, old_chargeable, new_chargeable):
    """同步参与人员和单场扣卡次数。"""
    from app.services import membership_card_service
    old_chargeable = membership_card_service.filter_arrived_customer_ids(session.date, old_chargeable)
    new_chargeable = membership_card_service.filter_arrived_customer_ids(session.date, new_chargeable)
    activity_key = f"eks:{session.id}"
    deduction_count = membership_card_service.get_activity_deduction_count(session)
    with membership_card_service._deduct_lock:
        for cid in old_chargeable | new_chargeable:
            target_count = deduction_count if cid in new_chargeable else 0
            membership_card_service._do_sync_activity_count(cid, activity_key, target_count)
        membership_card_service._save_deductions()
        membership_card_service._save_debts()


def _get_all_member_ids(session) -> set:
    ids = set(session.participant_ids or [])
    ids.update(session.teacher_ids or [])
    if session.host_id:
        ids.add(session.host_id)
    if session.owner_id:
        ids.add(session.owner_id)
    return ids


def _refresh_affected_identities(customer_ids: set):
    from app.services.member_identity_service import refresh_member_type
    for cid in customer_ids:
        if cid:
            try:
                refresh_member_type(cid)
            except Exception:
                pass


def create_session(data: EnergyKnotSessionCreate, refresh_identities: bool = True) -> EnergyKnotSession:
    now = datetime.now(timezone.utc)
    session = EnergyKnotSession(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _sessions[session.id] = session
    _save(session.id)
    _deduct_for_session(session)
    if refresh_identities:
        _refresh_affected_identities(_get_all_member_ids(session))
    return session


def update_session(session_id: str, data: dict) -> Optional[EnergyKnotSession]:
    from app.services import visit_service

    session = _sessions.get(session_id)
    if not session or session.is_deleted:
        return None

    old_ids = _get_all_member_ids(session)
    old_chargeable = _get_chargeable_ids(session)

    if "participant_ids" in data:
        visits = visit_service.list_visits(session.date)
        visit_ids = {v.customer_id for v in visits}
        data["participant_ids"] = [pid for pid in data["participant_ids"] if pid in visit_ids]

    for key, value in data.items():
        if hasattr(session, key) and key not in ("id", "created_at", "created_by", "is_deleted", "deleted_at"):
            setattr(session, key, value)

    if session.owner_id:
        session.participant_ids = [pid for pid in session.participant_ids if pid != session.owner_id]

    session.updated_at = datetime.now(timezone.utc)
    _sessions[session_id] = session
    _save(session_id)

    new_chargeable = _get_chargeable_ids(session)
    _sync_deduction(session, old_chargeable, new_chargeable)
    _refresh_affected_identities(old_ids | _get_all_member_ids(session))

    return session


def delete_session(session_id: str, refresh_identities: bool = True) -> bool:
    session = _sessions.get(session_id)
    if not session or session.is_deleted:
        return False
    affected_ids = _get_all_member_ids(session)
    _restore_for_session(session)
    session.is_deleted = True
    session.deleted_at = datetime.now(timezone.utc)
    _save(session_id)
    if refresh_identities:
        _refresh_affected_identities(affected_ids)
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


def get_session_deduction_count(session, customer_id: str | None = None) -> int:
    """读取单场能量结的实际销卡数，兼容历史记录中案主 ID 未写入详情的情况。"""
    try:
        descriptions = json.loads(session.description or "[]")
    except (json.JSONDecodeError, TypeError):
        descriptions = []
    items = [item for item in descriptions if isinstance(item, dict)] if isinstance(descriptions, list) else []

    target_id = customer_id or (getattr(session, "owner_id", "") or "")
    matched_items = [item for item in items if target_id and item.get("id") == target_id]
    if customer_id and not matched_items and getattr(session, "owner_id", "") != customer_id:
        return 0
    if not matched_items and items:
        # 旧版课表可能只保存 count、未保存案主 ID；单场只有一个案主，使用首项销卡数。
        matched_items = items[:1]
    if not matched_items:
        return 1

    count = 0
    for item in matched_items:
        try:
            count += max(1, int(item.get("count", 1) or 1))
        except (TypeError, ValueError):
            count += 1
    return max(1, count)


def get_remaining_count(customer_id: str) -> int:
    """计算某用户的能量结剩余次数；保存活动后立即按部位数扣除。"""
    knots = energy_knot_service.list_knots()
    total_purchased = sum(k.purchase_count for k in knots if k.customer_id == customer_id)
    used = 0
    for s in _sessions.values():
        if s.is_deleted:
            continue
        used += get_session_deduction_count(s, customer_id)
    from app.services import project_deduction_service
    manual_deductions = project_deduction_service.get_deduction_total(customer_id, "energy-knots")
    return total_purchased - used - manual_deductions
