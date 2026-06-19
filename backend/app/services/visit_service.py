import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

logger = logging.getLogger(__name__)

from app.models.visit import VisitRecord, VisitRecordCreate, CustomerSearchResult, ActivityInfo
from app.services.customer_service import list_customers
from app.services.storage import load_data, save_data, save_item, delete_item

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
    """统计某个客户的到访天数（同一天只算一次，仅计已到店）"""
    dates = {v.visit_date for v in _visits.values() if v.customer_id == customer_id and v.arrived}
    return len(dates)


def _get_customer_activities(customer_id: str, date: Optional[str] = None) -> List[ActivityInfo]:
    """从5个模块收集某客户在指定日期的活动"""
    if not customer_id:
        return []
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
        oh_card_reading_session_service,
    )
    activities = []
    visit = next((v for v in _visits.values()
                  if v.customer_id == customer_id and v.visit_date == date and not v.is_deleted), None)
    is_leader = visit is not None and visit.is_leader

    # 1. 沙龙活动 (class_records)
    for cr in class_record_service.list_records(date):
        # 获取课程老师名称
        from app.services.customer_service import get_customer
        teacher_names = []
        for tid in cr.teacher_ids:
            tc = get_customer(tid)
            if tc:
                teacher_names.append(tc.nickname or tc.name)
        owner_name = "、".join(teacher_names)

        if customer_id in cr.teacher_ids:
            activities.append(ActivityInfo(name=cr.course_name, role="课程老师", type="沙龙", owner_name=owner_name, is_welfare=cr.is_public_welfare))
        elif customer_id in cr.participant_ids:
            role = "组长" if is_leader else "参与者"
            activities.append(ActivityInfo(name=cr.course_name, role=role, type="沙龙", owner_name=owner_name, is_welfare=cr.is_public_welfare))

    # 2. 觉醒游戏 (group_case_sessions)
    for s in group_case_session_service.list_sessions(date):
        if customer_id == s.owner_id:
            activities.append(ActivityInfo(name="觉醒游戏", role="案主", type="觉醒", owner_name=s.owner_name or ""))
        elif customer_id == s.host_id:
            activities.append(ActivityInfo(name="觉醒游戏", role="主持人", type="觉醒", owner_name=s.owner_name or ""))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name="觉醒游戏", role="组长" if is_leader else "参与者", type="觉醒", owner_name=s.owner_name or ""))

    # 3. 情绪释放 (emotional_release_sessions)
    for s in emotional_release_session_service.list_sessions(date):
        if customer_id == s.owner_id:
            activities.append(ActivityInfo(name="情绪释放", role="案主", type="情绪", owner_name=s.owner_name or ""))
        elif customer_id == s.host_id:
            activities.append(ActivityInfo(name="情绪释放", role="主持人", type="情绪", owner_name=s.owner_name or ""))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name="情绪释放", role="组长" if is_leader else "参与者", type="情绪", owner_name=s.owner_name or ""))

    # 4. 能量结 (energy_knot_sessions)
    for s in energy_knot_session_service.list_sessions(date):
        if customer_id == s.owner_id:
            activities.append(ActivityInfo(name="能量结", role="案主", type="能量结", owner_name=s.owner_name or ""))
        elif customer_id in s.teacher_ids:
            activities.append(ActivityInfo(name="能量结", role="老师", type="能量结", owner_name=s.owner_name or ""))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name="能量结", role="组长" if is_leader else "参与者", type="能量结", owner_name=s.owner_name or ""))

    # 5. 内部课程 (internal_course_sessions)
    for s in internal_course_session_service.list_sessions(date):
        from app.services import customer_service
        teacher_names = "、".join([customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids])
        if customer_id in s.teacher_ids:
            activities.append(ActivityInfo(name=s.course_name, role="老师", type="内部课", owner_name=teacher_names))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name=s.course_name, role="组长" if is_leader else "参与者", type="内部课", owner_name=teacher_names))

    # 6. OH卡梳理 (oh_card_reading_sessions)
    for s in oh_card_reading_session_service.list_sessions(date):
        if customer_id == s.owner_id:
            activities.append(ActivityInfo(name="OH卡梳理", role="案主", type="OH卡", owner_name=s.owner_name or ""))
        elif customer_id in s.teacher_ids:
            activities.append(ActivityInfo(name="OH卡梳理", role="老师", type="OH卡", owner_name=s.owner_name or ""))
        elif customer_id in s.participant_ids:
            activities.append(ActivityInfo(name="OH卡梳理", role="组长" if is_leader else "参与者", type="OH卡", owner_name=s.owner_name or ""))

    return activities


_activity_counts_cache: dict[str, int] | None = None
_activity_counts_ts: float = 0
_welfare_counts_cache: dict[str, int] | None = None
_welfare_counts_ts: float = 0

def _invalidate_counts_cache():
    global _activity_counts_cache, _activity_counts_ts, _welfare_counts_cache, _welfare_counts_ts
    _activity_counts_cache = None
    _activity_counts_ts = 0
    _welfare_counts_cache = None
    _welfare_counts_ts = 0

def _build_customer_activity_counts() -> dict[str, int]:
    """一次扫描构建所有客户的活动总次数 {customer_id: count}，带 5 秒缓存"""
    global _activity_counts_cache, _activity_counts_ts
    now = datetime.now().timestamp()
    if _activity_counts_cache is not None and now - _activity_counts_ts < 5:
        return _activity_counts_cache
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
            if cid:
                counts[cid] += 1
    for s in group_case_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
            if cid:
                counts[cid] += 1
    for s in emotional_release_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
            if cid:
                counts[cid] += 1
    for s in energy_knot_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
            if cid:
                counts[cid] += 1
    for s in internal_course_session_service.list_sessions():
        for cid in (s.participant_ids + s.teacher_ids):
            if cid:
                counts[cid] += 1
    result = dict(counts)
    _activity_counts_cache = result
    _activity_counts_ts = now
    return result


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
            if customer_id in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
                count += 1
        return count
    if activity_type == "group_case":
        count = 0
        for s in group_case_session_service.list_sessions():
            if customer_id in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
                count += 1
        return count
    if activity_type == "energy_knot":
        count = 0
        for s in energy_knot_session_service.list_sessions():
            if customer_id in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
                count += 1
        return count
    if activity_type == "internal_course":
        count = 0
        for s in internal_course_session_service.list_sessions():
            if customer_id in (s.participant_ids + s.teacher_ids):
                count += 1
        return count
    return 0


def _build_customer_welfare_counts() -> dict[str, int]:
    """一次扫描构建所有客户的公益活动次数，带 5 秒缓存"""
    global _welfare_counts_cache, _welfare_counts_ts
    now = datetime.now().timestamp()
    if _welfare_counts_cache is not None and now - _welfare_counts_ts < 5:
        return _welfare_counts_cache
    from collections import defaultdict
    from app.services import class_record_service

    counts: dict[str, int] = defaultdict(int)
    for cr in class_record_service.list_records():
        if cr.is_public_welfare:
            for cid in cr.participant_ids:
                counts[cid] += 1
    result = dict(counts)
    _welfare_counts_cache = result
    _welfare_counts_ts = now
    return result


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


def get_date_counts(customer_ids: list[str] | None = None, start_date: str | None = None, end_date: str | None = None, space_id: str | None = None) -> dict[str, int]:
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
        if space_id is not None and v.space_id != space_id:
            continue
        if not v.customer_id:
            continue
        counts[v.visit_date] = counts.get(v.visit_date, 0) + 1
    return counts


def _count_untracked_chargeable_activities(customer_id: str) -> int:
    """统计某客户需要扣费但尚未扣费的活动数"""
    from app.services import membership_card_service
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
    )

    from app.services import internal_course_service
    if internal_course_service.has_active_course(customer_id):
        return 0

    deducted = set(membership_card_service._deductions.get(customer_id, []))
    count = 0

    # 觉醒游戏
    for s in group_case_session_service.list_sessions():
        if not s.is_deleted and customer_id in group_case_session_service._get_chargeable_ids(s):
            if f"gcs:{s.id}" not in deducted:
                count += 1

    # 情绪释放
    for s in emotional_release_session_service.list_sessions():
        if not s.is_deleted and customer_id in emotional_release_session_service._get_chargeable_ids(s):
            if f"ers:{s.id}" not in deducted:
                count += 1

    # 能量结
    for s in energy_knot_session_service.list_sessions():
        if not s.is_deleted and customer_id in energy_knot_session_service._get_chargeable_ids(s):
            if f"eks:{s.id}" not in deducted:
                count += 1

    # 沙龙（排除公益）
    for cr in class_record_service.list_records():
        if not cr.is_deleted and not cr.is_public_welfare:
            if customer_id in class_record_service._get_group_member_ids(cr):
                if f"class:{cr.id}" not in deducted:
                    count += 1

    return count


def list_visits(date: Optional[str] = None, customer_id: Optional[str] = None, space_id: Optional[str] = None) -> List[VisitRecord]:
    from app.services import membership_card_service

    records = [v for v in _visits.values() if not v.is_deleted]
    if date:
        records = [r for r in records if r.visit_date == date]
    if customer_id:
        records = [r for r in records if r.customer_id == customer_id]
    if space_id is not None:
        records = [r for r in records if r.space_id == space_id]

    # 批量构建所有客户的活动计数（一次扫描，O(total_records)）
    all_activity_counts = _build_customer_activity_counts()
    all_welfare_counts = _build_customer_welfare_counts()
    customer_activities_cache: dict[tuple, list] = {}

    for r in records:
        r.visit_count = count_customer_visits(r.customer_id)
        r.activity_count = all_activity_counts.get(r.customer_id, 0)
        r.welfare_count = all_welfare_counts.get(r.customer_id, 0)
        # 会员活动剩余次数
        today = datetime.now().strftime("%Y-%m-%d")
        all_cards = [c for c in membership_card_service.list_cards() if c.customer_id == r.customer_id and not c.is_deleted]
        # 筛选有效期内的卡
        active_cards = [c for c in all_cards if not c.expiry_date or c.expiry_date >= today]
        # 统计尚未扣费的活动数
        untracked = _count_untracked_chargeable_activities(r.customer_id)
        if active_cards:
            # 有有效卡：优先显示不限次，否则累加剩余次数
            unlimited = [c for c in active_cards if c.remaining_count is None]
            if unlimited:
                r.remaining_count = -999  # 不限次
            else:
                total = sum(c.remaining_count or 0 for c in active_cards)
                r.remaining_count = total - untracked
        else:
            # 无有效卡：有内部课程时归零即停，否则检查欠费
            from app.services import internal_course_service
            if internal_course_service.has_active_course(r.customer_id):
                r.remaining_count = 0
            else:
                debt = membership_card_service.get_debt(r.customer_id)
                total_debt = debt + untracked
                if total_debt > 0:
                    r.remaining_count = -total_debt  # -1 表示欠费1次，-2 表示欠费2次
                else:
                    r.remaining_count = 0
        # 当日参与的活动（跨5个模块），按 (customer_id, date) 缓存
        cache_key = (r.customer_id, r.visit_date)
        if cache_key not in customer_activities_cache:
            customer_activities_cache[cache_key] = _get_customer_activities(r.customer_id, r.visit_date)
        r.activities = customer_activities_cache[cache_key]

    return sorted(records, key=lambda r: r.created_at, reverse=True)


def create_visit(data: VisitRecordCreate) -> VisitRecord:
    _invalidate_counts_cache()
    # 检查当天是否已到场（customer_id 为空时跳过检查）
    if data.customer_id:
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
    try:
        _save(record.id)
        print(f"[VISIT_SAVED] {record.id}", flush=True)
    except Exception as e:
        print(f"[VISIT_SAVE_FAILED] {record.id}: {e}", flush=True)
        raise
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
    _invalidate_counts_cache()
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
            chargeable = set(s.participant_ids)
            chargeable.discard(s.owner_id)
            if cid in chargeable:
                membership_card_service.deduct_for_activity(cid, f"eks:{s.id}")

    # 沙龙类型
    for cr in class_record_service.list_records():
        if cr.date == date and not cr.is_public_welfare:
            chargeable = class_record_service._get_group_member_ids(cr)
            if cid in chargeable:
                membership_card_service.deduct_for_activity(cid, f"class:{cr.id}")


def _remove_from_parallel_lists(ids: list, names: list, target_id: str):
    """从并行的 ids/names 列表中移除指定 id，返回 (new_ids, new_names)"""
    new_ids, new_names = [], []
    for i, cid in enumerate(ids):
        if cid != target_id:
            new_ids.append(cid)
            new_names.append(names[i] if i < len(names) else "")
    return new_ids, new_names


def _cleanup_activity_records(customer_id: str, date: str):
    """删除到场人员时，同步清理当日所有活动记录中的该人员"""
    from app.services import (
        class_record_service, group_case_session_service,
        emotional_release_session_service, energy_knot_session_service,
        internal_course_session_service, oh_card_reading_session_service,
    )

    # 沙龙：teacher_ids, participant_ids, groups
    try:
        for cr in class_record_service.list_records(date=date):
            changed = False
            if customer_id in cr.teacher_ids:
                cr.teacher_ids = [x for x in cr.teacher_ids if x != customer_id]
                changed = True
            if customer_id in cr.participant_ids:
                cr.participant_ids = [x for x in cr.participant_ids if x != customer_id]
                changed = True
            # 清理 groups 中的该人员
            if cr.groups:
                for g in cr.groups:
                    if g.leader_id == customer_id:
                        g.leader_id = ""
                        changed = True
                    if g.deputy_id == customer_id:
                        g.deputy_id = ""
                        changed = True
                    if customer_id in g.member_ids:
                        g.member_ids = [x for x in g.member_ids if x != customer_id]
                        changed = True
                cr.groups = [g for g in cr.groups if g.leader_id or g.deputy_id or g.member_ids]
            if changed:
                class_record_service._save(cr.id)
    except Exception:
        logger.exception("清理沙龙记录失败 customer=%s date=%s", customer_id, date)

    # 觉醒游戏：host_id, teacher_ids, participant_ids
    try:
        for s in group_case_session_service.list_sessions(date=date):
            changed = False
            if s.host_id == customer_id:
                s.host_id = ""; s.host_name = ""; changed = True
            if customer_id in s.teacher_ids:
                s.teacher_ids = [x for x in s.teacher_ids if x != customer_id]; changed = True
            if customer_id in s.participant_ids:
                s.participant_ids = [x for x in s.participant_ids if x != customer_id]
                changed = True
            if changed:
                group_case_session_service._save(s.id)
    except Exception:
        logger.exception("清理觉醒游戏记录失败 customer=%s date=%s", customer_id, date)

    # 情绪释放：host_id, teacher_ids, participant_ids
    try:
        for s in emotional_release_session_service.list_sessions(date=date):
            changed = False
            if s.host_id == customer_id:
                s.host_id = ""; s.host_name = ""; changed = True
            if customer_id in s.teacher_ids:
                s.teacher_ids = [x for x in s.teacher_ids if x != customer_id]; changed = True
            if customer_id in s.participant_ids:
                s.participant_ids = [x for x in s.participant_ids if x != customer_id]
                changed = True
            if changed:
                emotional_release_session_service._save(s.id)
    except Exception:
        logger.exception("清理情绪释放记录失败 customer=%s date=%s", customer_id, date)

    # 能量结：teacher_ids, participant_ids
    try:
        for s in energy_knot_session_service.list_sessions(date=date):
            changed = False
            if customer_id in s.teacher_ids:
                s.teacher_ids = [x for x in s.teacher_ids if x != customer_id]; changed = True
            if customer_id in s.participant_ids:
                s.participant_ids = [x for x in s.participant_ids if x != customer_id]
                changed = True
            if changed:
                energy_knot_session_service._save(s.id)
    except Exception:
        logger.exception("清理能量结记录失败 customer=%s date=%s", customer_id, date)

    # 内部课程：teacher_ids, participant_ids
    try:
        for s in internal_course_session_service.list_sessions(date=date):
            changed = False
            if customer_id in s.teacher_ids:
                s.teacher_ids = [x for x in s.teacher_ids if x != customer_id]; changed = True
            if customer_id in s.participant_ids:
                s.participant_ids = [x for x in s.participant_ids if x != customer_id]
                changed = True
            if changed:
                internal_course_session_service._save(s.id)
    except Exception:
        logger.exception("清理内部课程记录失败 customer=%s date=%s", customer_id, date)

    # OH卡梳理：host_id, teacher_ids, participant_ids
    try:
        for s in oh_card_reading_session_service.list_sessions(date=date):
            changed = False
            if s.host_id == customer_id:
                s.host_id = ""; s.host_name = ""; changed = True
            if customer_id in s.teacher_ids:
                s.teacher_ids = [x for x in s.teacher_ids if x != customer_id]; changed = True
            if customer_id in s.participant_ids:
                s.participant_ids = [x for x in s.participant_ids if x != customer_id]
                changed = True
            if changed:
                oh_card_reading_session_service._save(s.id)
    except Exception:
        logger.exception("清理OH卡梳理记录失败 customer=%s date=%s", customer_id, date)

    # 清理分组
    try:
        from app.services import daily_grouping_service
        grouping = daily_grouping_service.get_grouping(date)
        if grouping and grouping.groups:
            cleaned = []
            for g in grouping.groups:
                if g.leader_id == customer_id: g.leader_id = ""
                if g.deputy_id == customer_id: g.deputy_id = ""
                g.member_ids = [x for x in g.member_ids if x != customer_id]
                if g.leader_id or g.deputy_id or g.member_ids:
                    cleaned.append(g)
            grouping.groups = cleaned
            daily_grouping_service._save(grouping.id)
    except Exception:
        logger.exception("清理分组失败 customer=%s date=%s", customer_id, date)

    logger.info("活动记录清理完成 customer=%s date=%s", customer_id, date)


def delete_visit(visit_id: str) -> bool:
    _invalidate_counts_cache()
    visit = _visits.pop(visit_id, None)
    if not visit:
        return False
    delete_item(FILENAME, visit_id)
    # 自动刷新会员身份
    from app.services import member_identity_service
    member_identity_service.refresh_member_type(visit.customer_id)
    # 同步清理活动记录中的该人员
    try:
        _cleanup_activity_records(visit.customer_id, visit.visit_date)
    except Exception:
        logger.exception("清理活动记录失败 visit_id=%s customer=%s", visit_id, visit.customer_id)
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
