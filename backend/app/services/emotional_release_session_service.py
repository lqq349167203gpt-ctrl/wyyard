import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.emotional_release_session import EmotionalReleaseSession, EmotionalReleaseSessionCreate
from app.services import customer_service, emotional_release_service
from app.services.storage import load_data, save_data, save_item

FILENAME = "emotional_release_sessions.json"
_sessions: Dict[str, EmotionalReleaseSession] = {}


def _load():
    global _sessions
    data = load_data(FILENAME)
    _sessions = {}
    for k, v in data.items():
        _sessions[k] = EmotionalReleaseSession(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _sessions.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _sessions.items()}
        save_data(FILENAME, data)


_load()


def list_sessions(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[EmotionalReleaseSession]:
    sessions = [v for v in _sessions.values() if not v.is_deleted]
    if date:
        sessions = [s for s in sessions if s.date == date]
    if start_date:
        sessions = [s for s in sessions if s.date >= start_date]
    if end_date:
        sessions = [s for s in sessions if s.date <= end_date]
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return sessions


def get_session(session_id: str) -> Optional[EmotionalReleaseSession]:
    session = _sessions.get(session_id)
    if session and session.is_deleted:
        return None
    return session


def _get_chargeable_ids(session) -> set:
    """需要扣费的人员：参与者 + 老师（不含案主）—— 供 visit 到店扣费使用"""
    ids = set(session.participant_ids)
    ids.discard(session.owner_id)
    return ids


def _deduct_for_session(session):
    """为新创建的活动扣费"""
    from app.services import membership_card_service
    chargeable = membership_card_service.filter_arrived_customer_ids(
        session.date,
        _get_chargeable_ids(session),
    )
    activity_key = f"ers:{session.id}"
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
    activity_key = f"ers:{session.id}"
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
    activity_key = f"ers:{session.id}"
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


def create_session(data: EmotionalReleaseSessionCreate, refresh_identities: bool = True) -> EmotionalReleaseSession:
    from app.services import visit_service

    visit_service.validate_activity_owner(data.date, data.owner_id)
    now = datetime.now(timezone.utc)
    session = EmotionalReleaseSession(
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


def update_session(session_id: str, data: dict):
    """返回 (session, []) 成功, (None, []) 未找到"""
    from app.services import visit_service

    session = _sessions.get(session_id)
    if not session or session.is_deleted:
        return None, []

    old_ids = _get_all_member_ids(session)
    old_chargeable = _get_chargeable_ids(session)

    target_date = data.get("date", session.date)
    target_owner_id = data.get("owner_id", session.owner_id)
    visit_service.validate_activity_owner(target_date, target_owner_id)

    # 自动过滤不在邀约名单中的人员
    if "participant_ids" in data:
        visits = visit_service.list_visits(target_date)
        visit_ids = {v.customer_id for v in visits}
        data["participant_ids"] = [pid for pid in data["participant_ids"] if pid in visit_ids]

    for key, value in data.items():
        if hasattr(session, key) and key not in ("id", "created_at", "created_by", "is_deleted", "deleted_at"):
            setattr(session, key, value)

    # 案主不能同时是参与者
    if session.owner_id:
        session.participant_ids = [pid for pid in session.participant_ids if pid != session.owner_id]

    session.updated_at = datetime.now(timezone.utc)
    _sessions[session_id] = session
    _save(session_id)

    new_chargeable = _get_chargeable_ids(session)
    _sync_deduction(session, old_chargeable, new_chargeable)
    _refresh_affected_identities(old_ids | _get_all_member_ids(session))

    return session, []


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



def search_customers(keyword: str, date: str = "") -> list:
    customers = customer_service.list_customers()
    if date:
        from app.services import visit_service
        invited_ids = visit_service.get_invited_customer_ids(date)
        customers = [c for c in customers if c.id in invited_ids]
    results = []
    for c in customers:
        if not keyword or keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
                "remaining": get_usable_remaining_count(c.id),
                "positions": [p.value if hasattr(p, 'value') else p for p in (c.positions or [])],
            })
    return results


def get_remaining_count(customer_id: str) -> int:
    """计算某用户的情绪释放剩余次数；仅已到场案主扣除。"""
    releases = emotional_release_service.list_releases()
    total_purchased = sum(r.purchase_count for r in releases if r.customer_id == customer_id)
    used = sum(item["count"] for item in _get_session_deductions_for_customer(customer_id))
    from app.services import project_deduction_service
    manual_deductions = project_deduction_service.get_deduction_total(customer_id, "emotional-releases")
    return total_purchased - used - manual_deductions


def get_usable_remaining_count(customer_id: str, on_date: str = "") -> int:
    """返回当前有效购买中真正可用的次数，并保留预支扣卡形成的负数。"""
    reference_date = on_date or datetime.now().strftime("%Y-%m-%d")
    purchases = [r for r in emotional_release_service.list_releases() if r.customer_id == customer_id]
    purchase_data = [
        {
            "id": p.id,
            "purchase_count": p.purchase_count,
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date,
        }
        for p in purchases
    ]

    from app.services import project_deduction_service

    manual_by_project = {
        p["id"]: project_deduction_service.get_deduction_total_for_project(p["id"])
        for p in purchase_data
    }
    remaining_by_purchase = _allocate_deductions_to_purchases(
        purchase_data,
        _get_session_deductions_for_customer(customer_id),
        manual_by_project,
    )
    active_remaining = sum(
        remaining_by_purchase.get(p["id"], 0)
        for p in purchase_data
        if (not p["effective_date"] or p["effective_date"] <= reference_date)
        and (not p["expiry_date"] or p["expiry_date"] >= reference_date)
    )
    return min(active_remaining, get_remaining_count(customer_id))


def get_debt_record(customer_id: str) -> dict:
    """返回单个客户的情绪释放欠卡汇总。"""
    from app.services import project_deduction_service

    customer = customer_service.get_customer(customer_id)
    remaining = get_remaining_count(customer_id)
    releases = emotional_release_service.list_releases()
    total = sum(release.purchase_count for release in releases if release.customer_id == customer_id)
    arrived_dates = {item["date"] for item in _get_session_deductions_for_customer(customer_id)}
    sessions = sorted(
        [s for s in _sessions.values() if not s.is_deleted and s.owner_id == customer_id and s.date in arrived_dates],
        key=lambda s: s.date,
    )
    used = len(sessions)
    manual = project_deduction_service.get_deduction_total(customer_id, "emotional-releases")
    debt = max(0, -remaining)
    debt_sessions = sessions[-debt:] if debt and debt <= len(sessions) else (sessions if debt else [])
    activities = [
        {"label": s.name or "情绪释放", "date": s.date, "count": 1}
        for s in debt_sessions
    ]
    return {
        "customer_id": customer_id,
        "nickname": customer.nickname if customer else "",
        "member_type": customer.member_type if customer else "",
        "total_count": total,
        "deducted_count": used + manual,
        "debt_count": debt,
        "debt_activities": activities,
        "activity_labels": [f"{item['label']} {item['date']}" for item in activities],
    }


def list_debt_customers() -> list:
    """列出情绪释放欠卡客户，返回 [{customer_id, nickname, member_type, total_count, deducted_count, debt_count, activity_labels}]"""
    result = []
    for customer in customer_service.list_customers():
        record = get_debt_record(customer.id)
        if record["debt_count"] > 0:
            result.append(record)
    result.sort(key=lambda r: r["nickname"])
    return result


def _get_session_deductions_for_customer(customer_id: str) -> list[dict]:
    """该用户已到场情绪释放的逐次活动销卡信息。"""
    from app.services import visit_service

    return [
        {"date": session.date, "count": 1}
        for session in _sessions.values()
        if not session.is_deleted
        and session.owner_id == customer_id
        and visit_service.is_customer_arrived(session.date, customer_id)
    ]


def _allocate_deductions_to_purchases(purchases, session_deductions, manual_by_project_id):
    """按最早到期优先原则，逐场活动分配销卡到各次购买上（活动日期在卡有效期之外的不扣该卡）。"""
    remaining = {}
    for p in purchases:
        pid = p["id"]
        manual = manual_by_project_id.get(pid, 0)
        remaining[pid] = max(0, p["purchase_count"] - manual)

    sorted_sessions = sorted(session_deductions, key=lambda s: s["date"])

    for sess in sorted_sessions:
        sess_date = sess["date"]
        to_deduct = sess["count"]
        if to_deduct <= 0:
            continue

        valid = [
            p for p in purchases
            if (not p.get("effective_date") or p["effective_date"] <= sess_date)
            and (not p.get("expiry_date") or p["expiry_date"] >= sess_date)
        ]
        def _sort_key(p):
            has_expiry = bool(p.get("expiry_date"))
            expiry = p.get("expiry_date") or ""
            return (0, expiry) if has_expiry else (1, "")
        valid.sort(key=_sort_key)

        for card in valid:
            if to_deduct <= 0:
                break
            cid = card["id"]
            avail = remaining.get(cid, 0)
            deduct = min(avail, to_deduct)
            remaining[cid] = avail - deduct
            to_deduct -= deduct

    return remaining


def get_purchase_remaining(purchase_id: str) -> int:
    """返回单次情绪释放购买的剩余次数。"""
    purchase = emotional_release_service.get_release(purchase_id)
    if not purchase:
        return 0

    customer_id = purchase.customer_id
    all_purchases = emotional_release_service.list_releases()
    customer_purchases = [
        {
            "id": p.id,
            "purchase_count": p.purchase_count,
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date,
        }
        for p in all_purchases
        if p.customer_id == customer_id
    ]

    session_deductions = _get_session_deductions_for_customer(customer_id)

    from app.services import project_deduction_service
    manual_by_project = {
        p["id"]: project_deduction_service.get_deduction_total_for_project(p["id"])
        for p in customer_purchases
    }

    result = _allocate_deductions_to_purchases(customer_purchases, session_deductions, manual_by_project)
    return result.get(purchase_id, 0)
