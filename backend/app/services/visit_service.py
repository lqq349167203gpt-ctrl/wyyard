import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from app.models.visit import VisitRecord, VisitRecordCreate, CustomerSearchResult, ActivityInfo
from app.services.customer_service import list_customers
from app.services.storage import load_data, save_data, save_item

FILENAME = "visits.json"
_visits: Dict[str, VisitRecord] = {}


def _load():
    global _visits
    data = load_data(FILENAME)
    _visits = {k: VisitRecord(**v) for k, v in data.items()}


def _save(visit_id: str = ""):
    if visit_id:
        item = _visits.get(visit_id)
        if item:
            save_item(FILENAME, visit_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _visits.items()}
        save_data(FILENAME, data)


_load()


def count_customer_visits(customer_id: str) -> int:
    """统计某个客户的到访天数（同一天只算一次）"""
    dates = {v.visit_date for v in _visits.values() if v.customer_id == customer_id}
    return len(dates)


def _get_customer_activities(customer_id: str, date: Optional[str] = None) -> List[ActivityInfo]:
    """从5个模块收集某客户在指定日期的活动"""
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    )
    activities = []

    # 1. 沙龙活动 (class_records)
    for cr in class_record_service.list_records(date):
        if customer_id in cr.participant_ids:
            role = ""
            if customer_id in cr.teacher_ids:
                role = "课程老师"
            else:
                for g in cr.groups:
                    if g.leader_id == customer_id:
                        role = "组长"
                        break
                    elif g.deputy_id == customer_id:
                        role = "副组长"
                        break
                    elif customer_id in g.member_ids:
                        role = "组员"
                        break
            # 获取课程老师名称
            from app.services.customer_service import get_customer
            teacher_names = []
            for tid in cr.teacher_ids:
                tc = get_customer(tid)
                if tc:
                    teacher_names.append(tc.nickname or tc.name)
            owner_name = "、".join(teacher_names)
            activities.append(ActivityInfo(name=cr.course_name, role=role, type="沙龙", owner_name=owner_name, is_welfare=cr.is_public_welfare))

    # 2. 觉醒游戏 (group_case_sessions)
    for s in group_case_session_service.list_sessions(date):
        extra = f"成就君：{s.achiever_name}" if (customer_id == s.owner_id and s.achiever_name) else ""
        if customer_id == s.owner_id:
            activities.append(ActivityInfo(name="觉醒游戏", role="案主", type="觉醒", owner_name=s.owner_name or "", extra_badge=extra))
        elif customer_id == s.host_id:
            activities.append(ActivityInfo(name="觉醒游戏", role="主持人", type="觉醒", owner_name=s.owner_name or ""))
        elif customer_id == s.achiever_id:
            activities.append(ActivityInfo(name="觉醒游戏", role="成就君", type="觉醒", owner_name=s.owner_name or ""))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name="觉醒游戏", role="参与者", type="觉醒", owner_name=s.owner_name or ""))

    # 3. 情绪释放 (emotional_release_sessions)
    for s in emotional_release_session_service.list_sessions(date):
        extra = f"成就君：{s.achiever_name}" if (customer_id == s.owner_id and s.achiever_name) else ""
        if customer_id == s.owner_id:
            activities.append(ActivityInfo(name="情绪释放", role="案主", type="情绪", owner_name=s.owner_name or "", extra_badge=extra))
        elif customer_id == s.host_id:
            activities.append(ActivityInfo(name="情绪释放", role="主持人", type="情绪", owner_name=s.owner_name or ""))
        elif customer_id == s.achiever_id:
            activities.append(ActivityInfo(name="情绪释放", role="成就君", type="情绪", owner_name=s.owner_name or ""))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name="情绪释放", role="参与者", type="情绪", owner_name=s.owner_name or ""))

    # 4. 能量结 (energy_knot_sessions)
    for s in energy_knot_session_service.list_sessions(date):
        if customer_id == s.owner_id:
            activities.append(ActivityInfo(name="能量结", role="案主", type="能量结", owner_name=s.owner_name or ""))
        elif customer_id in s.host_ids:
            activities.append(ActivityInfo(name="能量结", role="课程老师", type="能量结", owner_name=s.owner_name or ""))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name="能量结", role="参与者", type="能量结", owner_name=s.owner_name or ""))

    # 5. 内部课程 (internal_course_sessions)
    for s in internal_course_session_service.list_sessions(date):
        host_names = "、".join(s.host_names) if s.host_names else ""
        if customer_id in s.host_ids:
            activities.append(ActivityInfo(name=s.course_name, role="课程老师", type="内部课", owner_name=host_names))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name=s.course_name, role="参与者", type="内部课", owner_name=host_names))

    return activities


def _build_customer_activity_counts() -> dict[str, int]:
    """一次扫描构建所有客户的活动总次数 {customer_id: count}"""
    from collections import defaultdict
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    )
    counts: dict[str, int] = defaultdict(int)
    for cr in class_record_service.list_records():
        for cid in cr.participant_ids:
            counts[cid] += 1
    for s in group_case_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id, s.achiever_id]):
            if cid:
                counts[cid] += 1
    for s in emotional_release_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id, s.achiever_id]):
            if cid:
                counts[cid] += 1
    for s in energy_knot_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id] + s.host_ids):
            if cid:
                counts[cid] += 1
    for s in internal_course_session_service.list_sessions():
        for cid in (s.participant_ids + s.host_ids):
            if cid:
                counts[cid] += 1
    return dict(counts)


def _count_customer_activities(customer_id: str) -> int:
    """统计某客户参与的活动总次数（使用批量构建的缓存）"""
    return _build_customer_activity_counts().get(customer_id, 0)


def _count_customer_activities_by_type(customer_id: str, activity_type: str) -> int:
    """按活动类型统计某客户参与的活动次数"""
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    )
    if activity_type == "membership":
        count = 0
        for cr in class_record_service.list_records():
            if customer_id in cr.participant_ids:
                count += 1
        return count
    if activity_type == "emotional_release":
        count = 0
        for s in emotional_release_session_service.list_sessions():
            if customer_id in (s.participant_ids + [s.owner_id, s.host_id, s.achiever_id]):
                count += 1
        return count
    if activity_type == "group_case":
        count = 0
        for s in group_case_session_service.list_sessions():
            if customer_id in (s.participant_ids + [s.owner_id, s.host_id, s.achiever_id]):
                count += 1
        return count
    if activity_type == "energy_knot":
        count = 0
        for s in energy_knot_session_service.list_sessions():
            if customer_id in (s.participant_ids + [s.owner_id] + s.host_ids):
                count += 1
        return count
    if activity_type == "internal_course":
        count = 0
        for s in internal_course_session_service.list_sessions():
            if customer_id in (s.participant_ids + s.host_ids):
                count += 1
        return count
    return 0


def _build_customer_welfare_counts() -> dict[str, int]:
    """一次扫描构建所有客户的公益活动次数"""
    from collections import defaultdict
    from app.services import class_record_service

    counts: dict[str, int] = defaultdict(int)
    for cr in class_record_service.list_records():
        if cr.is_public_welfare:
            for cid in cr.participant_ids:
                counts[cid] += 1
    return dict(counts)


def _count_customer_welfare_activities(customer_id: str) -> int:
    return _build_customer_welfare_counts().get(customer_id, 0)


def get_visit(visit_id: str) -> Optional[VisitRecord]:
    r = _visits.get(visit_id)
    if r and r.is_deleted:
        return None
    if r:
        r.activities = _get_customer_activities(r.customer_id, r.visit_date)
        r.activity_count = _count_customer_activities(r.customer_id)
        r.welfare_count = _count_customer_welfare_activities(r.customer_id)
        r.visit_count = count_customer_visits(r.customer_id)
    return r


def get_date_counts(customer_ids: list[str] | None = None, start_date: str | None = None, end_date: str | None = None) -> dict[str, int]:
    """返回各日期的到场人数统计，不做活动计数。customer_ids 用于权限过滤"""
    allowed = set(customer_ids) if customer_ids else None
    counts: dict[str, int] = {}
    for v in _visits.values():
        if v.is_deleted:
            continue
        if start_date and v.visit_date < start_date:
            continue
        if end_date and v.visit_date > end_date:
            continue
        if allowed is not None and v.customer_id not in allowed:
            continue
        counts[v.visit_date] = counts.get(v.visit_date, 0) + 1
    return counts


def list_visits(date: Optional[str] = None, customer_id: Optional[str] = None) -> List[VisitRecord]:
    from app.services import membership_card_service

    records = [v for v in _visits.values() if not v.is_deleted]
    if date:
        records = [r for r in records if r.visit_date == date]
    if customer_id:
        records = [r for r in records if r.customer_id == customer_id]

    # 批量构建所有客户的活动计数（一次扫描，O(total_records)）
    all_activity_counts = _build_customer_activity_counts()
    all_welfare_counts = _build_customer_welfare_counts()
    customer_activities_cache: dict[tuple, list] = {}

    for r in records:
        r.visit_count = count_customer_visits(r.customer_id)
        r.activity_count = all_activity_counts.get(r.customer_id, 0)
        r.welfare_count = all_welfare_counts.get(r.customer_id, 0)
        # 会员活动剩余次数
        cards = [c for c in membership_card_service.list_cards() if c.customer_id == r.customer_id]
        if cards:
            cards.sort(key=lambda c: c.created_at, reverse=True)
            card = cards[0]
            # 已过期的会员卡，剩余次数视为0
            today = datetime.now().strftime("%Y-%m-%d")
            if card.expiry_date and card.expiry_date < today:
                r.remaining_count = 0
            else:
                r.remaining_count = card.remaining_count if card.remaining_count is not None else -1
        else:
            r.remaining_count = 0
        # 当日参与的活动（跨5个模块）
        # 当日参与的活动（跨5个模块），按 (customer_id, date) 缓存
        cache_key = (r.customer_id, r.visit_date)
        if cache_key not in customer_activities_cache:
            customer_activities_cache[cache_key] = _get_customer_activities(r.customer_id, r.visit_date)
        r.activities = customer_activities_cache[cache_key]

    return sorted(records, key=lambda r: r.created_at, reverse=True)


def create_visit(data: VisitRecordCreate) -> VisitRecord:
    # 检查当天是否已到场
    for v in _visits.values():
        if v.customer_id == data.customer_id and v.visit_date == data.visit_date and not v.is_deleted:
            raise ValueError(f"{data.nickname} 当天已经到场")
    now = datetime.now(timezone.utc)
    record = VisitRecord(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _visits[record.id] = record
    _save(record.id)
    # 计算该客户到访总次数（含本次）
    record.visit_count = count_customer_visits(record.customer_id)
    # 如果创建时即为已到店，执行会员活动扣费
    if record.arrived:
        _deduct_for_arrival(record)
    # 自动刷新会员身份
    from app.services import member_identity_service
    member_identity_service.refresh_member_type(record.customer_id)
    return record


def update_visit(visit_id: str, data: dict) -> Optional[VisitRecord]:
    record = _visits.get(visit_id)
    if not record:
        return None
    old_arrived = record.arrived
    for key, value in data.items():
        if hasattr(record, key) and key not in ("id", "created_at"):
            setattr(record, key, value)
    new_arrived = record.arrived
    record.updated_at = datetime.now(timezone.utc)
    _visits[visit_id] = record
    _save(visit_id)
    # 从未到店 → 已到店：执行会员活动扣费
    if not old_arrived and new_arrived:
        _deduct_for_arrival(record)
    # 自动刷新会员身份
    from app.services import member_identity_service
    member_identity_service.refresh_member_type(record.customer_id)
    return record


def _deduct_for_arrival(visit):
    """到店扣费：遍历当天所有 session，对参与/主持的人员扣减会员活动次数"""
    from app.services import membership_card_service
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    )
    cid = visit.customer_id
    date = visit.visit_date

    # 觉醒游戏
    for s in group_case_session_service.list_sessions():
        if s.date == date:
            chargeable = group_case_session_service._get_chargeable_ids(s)
            if cid in chargeable:
                membership_card_service.deduct_for_activity(cid, f"gcs:{s.id}")

    # 情绪释放
    for s in emotional_release_session_service.list_sessions():
        if s.date == date:
            chargeable = emotional_release_session_service._get_chargeable_ids(s)
            if cid in chargeable:
                membership_card_service.deduct_for_activity(cid, f"ers:{s.id}")

    # 能量结
    for s in energy_knot_session_service.list_sessions():
        if s.date == date and not s.is_deleted:
            chargeable = set(s.participant_ids) | set(s.host_ids)
            chargeable.discard(s.owner_id)
            if cid in chargeable:
                membership_card_service.deduct_for_activity(cid, f"eks:{s.id}")

    # 内部课程
    for s in internal_course_session_service.list_sessions():
        if s.date == date and not s.is_deleted:
            chargeable = set(s.participant_ids) | set(s.host_ids)
            if cid in chargeable:
                membership_card_service.deduct_for_activity(cid, f"ics:{s.id}")

    # 沙龙类型
    for cr in class_record_service.list_records():
        if cr.date == date and not cr.is_public_welfare:
            chargeable = class_record_service._get_group_member_ids(cr)
            if cid in chargeable:
                membership_card_service.deduct_for_activity(cid, f"class:{cr.id}")


def delete_visit(visit_id: str) -> bool:
    visit = _visits.get(visit_id)
    if not visit:
        return False
    visit.is_deleted = True
    visit.deleted_at = datetime.now(timezone.utc)
    _save(visit_id)
    # 自动刷新会员身份
    from app.services import member_identity_service
    member_identity_service.refresh_member_type(visit.customer_id)
    return True


def search_customers(keyword: str) -> List[CustomerSearchResult]:
    if not keyword:
        return []
    customers = list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            results.append(CustomerSearchResult(
                id=c.id,
                nickname=c.nickname,
                name=c.name or "",
                member_type=c.member_type or "",
                visit_count=count_customer_visits(c.id),
            ))
    return results
