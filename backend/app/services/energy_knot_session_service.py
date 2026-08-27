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
    """能量结不扣会员卡，无需写入会员卡扣卡与欠卡数据。"""
    return None


def _restore_for_session(session):
    """能量结不扣会员卡，删除时无需恢复会员卡数据。"""
    return None


def _sync_deduction(session, old_chargeable, new_chargeable):
    """能量结不扣会员卡，参与人员变化无需同步会员卡数据。"""
    return None


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
    from app.services import visit_service

    visit_service.validate_activity_owner(data.date, data.owner_id)
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

    target_date = data.get("date", session.date)
    target_owner_id = data.get("owner_id", session.owner_id)
    visit_service.validate_activity_owner(target_date, target_owner_id)

    if "participant_ids" in data:
        visits = visit_service.list_visits(target_date)
        visit_ids = {v.customer_id for v in visits}
        data["participant_ids"] = [pid for pid in data["participant_ids"] if pid in visit_ids]

    for key, value in data.items():
        if hasattr(session, key) and key not in ("id", "created_at", "created_by_id", "created_by", "is_deleted", "deleted_at"):
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


def search_customers(keyword: str, date: str = "") -> list:
    customers = customer_service.list_customers()
    if date:
        from app.services import visit_service
        invited_ids = visit_service.get_invited_customer_ids(date)
        customers = [c for c in customers if c.id in invited_ids]
    results = []
    for c in customers:
        if not keyword or keyword in c.nickname or (c.name and keyword in c.name):
            remaining = get_usable_remaining_count(c.id)
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
    """计算某用户的能量结剩余次数；仅已到场案主按部位数扣除。"""
    knots = energy_knot_service.list_knots()
    total_purchased = sum(k.purchase_count for k in knots if k.customer_id == customer_id)
    used = sum(item["count"] for item in _get_session_deductions_for_customer(customer_id))
    from app.services import project_deduction_service
    manual_deductions = project_deduction_service.get_deduction_total(customer_id, "energy-knots")
    return total_purchased - used - manual_deductions


def get_usable_remaining_count(customer_id: str, on_date: str = "") -> int:
    """返回当前有效购买中真正可用的部位数，并保留预支扣卡形成的负数。"""
    reference_date = on_date or datetime.now().strftime("%Y-%m-%d")
    purchases = [k for k in energy_knot_service.list_knots() if k.customer_id == customer_id]
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
    """返回单个客户的能量结欠卡汇总。"""
    from app.services import project_deduction_service

    customer = customer_service.get_customer(customer_id)
    remaining = get_remaining_count(customer_id)
    knots = energy_knot_service.list_knots()
    total = sum(knot.purchase_count for knot in knots if knot.customer_id == customer_id)
    sessions = sorted(
        [s for s in _sessions.values() if not s.is_deleted and s.owner_id == customer_id],
        key=lambda s: s.date,
    )
    arrived_dates = {item["date"] for item in _get_session_deductions_for_customer(customer_id)}
    sessions = [s for s in sessions if s.date in arrived_dates]
    used = sum(get_session_deduction_count(s, customer_id) for s in sessions)
    manual = project_deduction_service.get_deduction_total(customer_id, "energy-knots")
    debt = max(0, -remaining)

    activities = []
    remaining_debt = debt
    for session in reversed(sessions):
        count = get_session_deduction_count(session, customer_id)
        if count <= 0 or remaining_debt <= 0:
            continue
        debt_count = min(count, remaining_debt)
        activities.append({
            "label": session.name or "能量结",
            "date": session.date,
            "count": debt_count,
        })
        remaining_debt -= debt_count
    activities.reverse()
    return {
        "customer_id": customer_id,
        "nickname": customer.nickname if customer else "",
        "member_type": customer.member_type if customer else "",
        "total_count": total,
        "deducted_count": used + manual,
        "debt_count": debt,
        "debt_activities": activities,
        "activity_labels": [
            f"{item['label']} {item['date']}×{item['count']}"
            for item in activities
        ],
    }


def list_debt_customers() -> list:
    """列出能量结欠卡客户，返回 [{customer_id, nickname, member_type, total_count, deducted_count, debt_count, activity_labels}]"""
    result = []
    for customer in customer_service.list_customers():
        record = get_debt_record(customer.id)
        if record["debt_count"] > 0:
            result.append(record)
    result.sort(key=lambda r: r["nickname"])
    return result


def _get_session_deductions_for_customer(customer_id: str) -> list[dict]:
    """该用户已到场能量结的逐次活动销卡信息。"""
    from app.services import visit_service

    result = []
    for s in _sessions.values():
        if s.is_deleted or s.owner_id != customer_id:
            continue
        if not visit_service.is_customer_arrived(s.date, customer_id):
            continue
        cnt = get_session_deduction_count(s, customer_id)
        if cnt > 0:
            result.append({"date": s.date, "count": cnt})
    return result


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
    """返回单次能量结购买的剩余次数。"""
    purchase = energy_knot_service.get_knot(purchase_id)
    if not purchase:
        return 0

    customer_id = purchase.customer_id
    all_purchases = energy_knot_service.list_knots()
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
