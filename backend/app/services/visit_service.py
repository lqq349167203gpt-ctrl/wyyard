import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

logger = logging.getLogger(__name__)

from app.models.visit import VisitRecord, VisitRecordCreate, CustomerSearchResult, ActivityInfo
from app.services.customer_service import list_customers, get_customer
from app.services.storage import load_data, save_data, save_item, delete_item

FILENAME = "visits.json"
_visits: Dict[str, VisitRecord] = {}
_visit_lock = threading.Lock()


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
    dates = {v.visit_date for v in _visits.values() if v.customer_id == customer_id and v.arrived and not v.is_deleted}
    return len(dates)


def count_customer_invitations(customer_id: str) -> int:
    """统计某个客户的受邀次数（所有邀约记录，不含已删除）"""
    return sum(1 for v in _visits.values() if v.customer_id == customer_id and not v.is_deleted)


def get_last_visit_date(customer_id: str) -> str:
    """获取客户最近一次到店日期"""
    dates = [v.visit_date for v in _visits.values() if v.customer_id == customer_id and v.arrived]
    return max(dates) if dates else ""


def _get_customer_activities(customer_id: str, date: Optional[str] = None) -> List[ActivityInfo]:
    """从5个模块收集某客户在指定日期的活动（单客户版本，供详情页使用）"""
    result = _build_all_activities(date)
    return result.get(customer_id, [])


def _build_all_activities(date: Optional[str] = None) -> dict[str, list[ActivityInfo]]:
    """批量构建指定日期所有客户的活动映射 {customer_id: [ActivityInfo]}，一次遍历 6 个模块"""
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
        oh_card_reading_session_service,
        customer_service,
    )
    from collections import defaultdict

    # 构建 leader 集合
    leader_set = {v.customer_id for v in _visits.values()
                  if v.visit_date == date and v.is_leader and not v.is_deleted}

    result: dict[str, list[ActivityInfo]] = defaultdict(list)

    def _role(cid: str) -> str:
        return "组长" if cid in leader_set else "参与者"

    # 1. 沙龙活动（teacher 优先于 participant；participant 范围含 groups 分组人员）
    for cr in class_record_service.list_records(date):
        teacher_names = []
        for tid in cr.teacher_ids:
            tc = customer_service.get_customer(tid)
            if tc:
                teacher_names.append(tc.nickname or tc.name)
        owner_name = "、".join(teacher_names)
        chargeable = class_record_service._get_group_member_ids(cr)  # participant_ids ∪ groups.* - teacher_ids
        all_ids = set(cr.teacher_ids) | chargeable
        for cid in all_ids:
            if cid in cr.teacher_ids:
                result[cid].append(ActivityInfo(name=cr.course_name, role="课程老师", type="沙龙", owner_name=owner_name, is_welfare=cr.is_public_welfare))
            else:
                result[cid].append(ActivityInfo(name=cr.course_name, role=_role(cid), type="沙龙", owner_name=owner_name, is_welfare=cr.is_public_welfare))

    # 2. 觉醒游戏（owner > host > participant）
    for s in group_case_session_service.list_sessions(date):
        all_ids = set()
        if s.owner_id: all_ids.add(s.owner_id)
        if s.host_id: all_ids.add(s.host_id)
        all_ids.update(s.participant_ids)
        for cid in all_ids:
            if cid == s.owner_id:
                result[cid].append(ActivityInfo(name="觉醒游戏", role="案主", type="觉醒", owner_name=s.owner_name or ""))
            elif cid == s.host_id:
                result[cid].append(ActivityInfo(name="觉醒游戏", role="主持人", type="觉醒", owner_name=s.owner_name or ""))
            elif cid in s.participant_ids:
                result[cid].append(ActivityInfo(name="觉醒游戏", role=_role(cid), type="觉醒", owner_name=s.owner_name or ""))

    # 3. 情绪释放（owner > host > participant）
    for s in emotional_release_session_service.list_sessions(date):
        all_ids = set()
        if s.owner_id: all_ids.add(s.owner_id)
        if s.host_id: all_ids.add(s.host_id)
        all_ids.update(s.participant_ids)
        for cid in all_ids:
            if cid == s.owner_id:
                result[cid].append(ActivityInfo(name="情绪释放", role="案主", type="情绪", owner_name=s.owner_name or ""))
            elif cid == s.host_id:
                result[cid].append(ActivityInfo(name="情绪释放", role="主持人", type="情绪", owner_name=s.owner_name or ""))
            elif cid in s.participant_ids:
                result[cid].append(ActivityInfo(name="情绪释放", role=_role(cid), type="情绪", owner_name=s.owner_name or ""))

    # 4. 能量结（owner > teacher > participant）
    for s in energy_knot_session_service.list_sessions(date):
        all_ids = set()
        if s.owner_id: all_ids.add(s.owner_id)
        all_ids.update(s.teacher_ids)
        all_ids.update(s.participant_ids)
        for cid in all_ids:
            if cid == s.owner_id:
                result[cid].append(ActivityInfo(name="能量结", role="案主", type="能量结", owner_name=s.owner_name or ""))
            elif cid in s.teacher_ids:
                result[cid].append(ActivityInfo(name="能量结", role="老师", type="能量结", owner_name=s.owner_name or ""))
            elif cid in s.participant_ids:
                result[cid].append(ActivityInfo(name="能量结", role=_role(cid), type="能量结", owner_name=s.owner_name or ""))

    # 5. 内部课程（teacher > participant）
    for s in internal_course_session_service.list_sessions(date):
        teacher_names = "、".join([customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids])
        all_ids = set(s.teacher_ids) | set(s.participant_ids)
        for cid in all_ids:
            if cid in s.teacher_ids:
                result[cid].append(ActivityInfo(name=s.course_name, role="老师", type="内部课", owner_name=teacher_names))
            elif cid in s.participant_ids:
                result[cid].append(ActivityInfo(name=s.course_name, role=_role(cid), type="内部课", owner_name=teacher_names))

    # 6. OH卡梳理（owner > teacher > participant）
    for s in oh_card_reading_session_service.list_sessions(date):
        all_ids = set()
        if s.owner_id: all_ids.add(s.owner_id)
        all_ids.update(s.teacher_ids)
        all_ids.update(s.participant_ids)
        for cid in all_ids:
            if cid == s.owner_id:
                result[cid].append(ActivityInfo(name="OH卡梳理", role="案主", type="OH卡", owner_name=s.owner_name or ""))
            elif cid in s.teacher_ids:
                result[cid].append(ActivityInfo(name="OH卡梳理", role="老师", type="OH卡", owner_name=s.owner_name or ""))
            elif cid in s.participant_ids:
                result[cid].append(ActivityInfo(name="OH卡梳理", role=_role(cid), type="OH卡", owner_name=s.owner_name or ""))

    final = dict(result)
    print(f"[_build_all_activities] date={date}, customers={len(final)}, total_acts={sum(len(v) for v in final.values())}", flush=True)
    return final


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
        oh_card_reading_session_service,
    )
    counts: dict[str, int] = defaultdict(int)
    for cr in class_record_service.list_records():
        for cid in (class_record_service._get_group_member_ids(cr) | set(cr.teacher_ids)):
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
        for cid in (s.participant_ids + [s.owner_id] + s.teacher_ids):
            if cid:
                counts[cid] += 1
    for s in internal_course_session_service.list_sessions():
        for cid in (s.participant_ids + s.teacher_ids):
            if cid:
                counts[cid] += 1
    for s in oh_card_reading_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id] + s.teacher_ids):
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
        oh_card_reading_session_service,
    )
    if activity_type == "membership":
        count = 0
        for cr in class_record_service.list_records():
            if customer_id in (class_record_service._get_group_member_ids(cr) | set(cr.teacher_ids)):
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
            if customer_id in (s.participant_ids + [s.owner_id] + s.teacher_ids):
                count += 1
        return count
    if activity_type == "internal_course":
        count = 0
        for s in internal_course_session_service.list_sessions():
            if customer_id in (s.participant_ids + s.teacher_ids):
                count += 1
        return count
    if activity_type == "oh_card":
        count = 0
        for s in oh_card_reading_session_service.list_sessions():
            if customer_id in (s.participant_ids + [s.owner_id] + s.teacher_ids):
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


def count_arrived_chargeable_activities(customer_id: str) -> int:
    """统计某客户所有已到场的可扣费活动数（用于显示活动扣卡次数）"""
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
    )
    from app.services import internal_course_service
    if internal_course_service.has_active_course(customer_id):
        return 0

    arrived_dates = set()
    for v in _visits.values():
        if not v.is_deleted and v.customer_id == customer_id and v.arrived:
            arrived_dates.add(v.visit_date)

    count = 0

    for s in group_case_session_service.list_sessions():
        if not s.is_deleted and customer_id in group_case_session_service._get_chargeable_ids(s):
            if s.date in arrived_dates:
                count += 1

    for s in emotional_release_session_service.list_sessions():
        if not s.is_deleted and customer_id in emotional_release_session_service._get_chargeable_ids(s):
            if s.date in arrived_dates:
                count += 1

    for s in energy_knot_session_service.list_sessions():
        if not s.is_deleted and customer_id in energy_knot_session_service._get_chargeable_ids(s):
            if s.date in arrived_dates:
                count += 1

    for cr in class_record_service.list_records():
        if not cr.is_deleted and not cr.is_public_welfare:
            if customer_id in class_record_service._get_group_member_ids(cr):
                if cr.date in arrived_dates:
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

    # 按日期分组，批量构建活动详情（每个日期只遍历 6 个模块一次）
    dates = {r.visit_date for r in records}
    all_activities: dict[tuple, list] = {}
    try:
        for d in dates:
            acts = _build_all_activities(d)
            for cid, act_list in acts.items():
                all_activities[(cid, d)] = act_list
    except Exception as e:
        print(f"[list_visits] _build_all_activities error: {e}", flush=True)
    print(f"[list_visits] date_filter={date}, records={len(records)}, dates={dates}, activity_keys={len(all_activities)}", flush=True)

    # 批量构建所有客户的 remaining_count
    all_cards_map: dict[str, list] = {}
    for c in membership_card_service.list_cards():
        if not c.is_deleted:
            all_cards_map.setdefault(c.customer_id, []).append(c)

    # 批量构建每个客户的到店次数和受邀次数
    all_arrived_counts: dict[str, int] = {}
    all_invitation_counts: dict[str, int] = {}
    for v in _visits.values():
        if not v.is_deleted:
            all_invitation_counts[v.customer_id] = all_invitation_counts.get(v.customer_id, 0) + 1
            if v.arrived:
                all_arrived_counts[v.customer_id] = all_arrived_counts.get(v.customer_id, 0) + 1

    for r in records:
        r.visit_count = count_customer_visits(r.customer_id)
        r.arrived_count = all_arrived_counts.get(r.customer_id, 0)
        r.invitation_count = all_invitation_counts.get(r.customer_id, 0)
        if not r.member_type:
            customer = get_customer(r.customer_id)
            if customer:
                r.member_type = customer.member_type or ""
        r.activity_count = all_activity_counts.get(r.customer_id, 0)
        r.welfare_count = all_welfare_counts.get(r.customer_id, 0)
        # 会员活动剩余次数：唯一真理由流水派生（总-销卡-活动扣卡），None=不限次
        effective = membership_card_service.get_effective_remaining(r.customer_id)
        if effective is None:
            # 不限次：不限次卡在有效期 OR 内部课程在有效期
            from app.services import internal_course_service
            active_cards = all_cards_map.get(r.customer_id, [])
            if any(c.remaining_count is None for c in active_cards) or internal_course_service.has_active_course(r.customer_id):
                r.remaining_count = -999
            else:
                r.remaining_count = 0
        else:
            r.remaining_count = effective
        r.activities = all_activities.get((r.customer_id, r.visit_date), [])

    if records:
        sample = records[0]
        sample_nick = ""
        try:
            from app.services import customer_service
            sc = customer_service.get_customer(sample.customer_id)
            sample_nick = sc.nickname if sc else ""
        except Exception:
            pass
        print(f"[list_visits] sample: {sample_nick}, is_leader={sample.is_leader}, activities={[(a.name, a.role) for a in sample.activities]}", flush=True)

    return sorted(records, key=lambda r: (r.sort_order, -r.created_at.timestamp()))


def list_visits_light(date: Optional[str] = None, space_id: Optional[str] = None) -> List[dict]:
    """轻量版：只返回列表页需要的字段，不计算活动详情"""
    from app.services import membership_card_service

    records = [v for v in _visits.values() if not v.is_deleted]
    if date:
        records = [r for r in records if r.visit_date == date]
    if space_id is not None:
        records = [r for r in records if r.space_id == space_id]

    try:
        all_activity_counts = _build_customer_activity_counts()
    except Exception as e:
        print(f"[list_visits_light] _build_customer_activity_counts error: {e}", flush=True)
        all_activity_counts = {}

    result = []
    today = datetime.now().strftime("%Y-%m-%d")
    for r in sorted(records, key=lambda r: (r.sort_order, -r.created_at.timestamp())):
        try:
            # 从客户表获取 member_type 和 nickname
            customer = get_customer(r.customer_id)
            member_type = r.member_type or ""
            if not member_type and customer:
                member_type = customer.member_type or ""

            # remaining_count：唯一真理由流水派生（总-销卡-活动扣卡）
            remaining_count = 0
            effective = membership_card_service.get_effective_remaining(r.customer_id)
            if effective is None:
                # 不限次：不限次卡在有效期 OR 内部课程在有效期
                from app.services import internal_course_service
                all_cards = [c for c in membership_card_service.list_cards() if c.customer_id == r.customer_id and not c.is_deleted]
                active_cards = [c for c in all_cards if not c.expiry_date or c.expiry_date >= today]
                if any(c.remaining_count is None for c in active_cards) or internal_course_service.has_active_course(r.customer_id):
                    remaining_count = -999
                else:
                    remaining_count = 0
            else:
                remaining_count = effective

            result.append({
                "id": r.id,
                "customer_id": r.customer_id,
                "nickname": customer.nickname if customer else "",
                "phone": getattr(r, 'phone', '') or "",
                "visit_date": r.visit_date,
                "arrived": r.arrived,
                "arrival_time": r.arrival_time or "",
                "is_leader": r.is_leader,
                "space_id": r.space_id or "",
                "member_type": member_type,
                "remaining_count": remaining_count,
                "activity_count": all_activity_counts.get(r.customer_id, 0),
                "visit_count": count_customer_visits(r.customer_id),
                "created_at": r.created_at.isoformat() if hasattr(r.created_at, 'isoformat') else str(r.created_at),
            })
        except Exception as e:
            print(f"[list_visits_light] record {r.id} error: {e}", flush=True)

    return result


def create_visit(data: VisitRecordCreate) -> VisitRecord:
    # 验证客户必须存在于系统中
    if data.customer_id:
        from app.services import customer_service
        if not customer_service.get_customer(data.customer_id):
            raise ValueError("客户不存在，无法创建到店记录")
    _invalidate_counts_cache()
    with _visit_lock:
        # 检查当天是否已到场（customer_id 为空时跳过检查）
        if data.customer_id:
            for v in _visits.values():
                if v.customer_id == data.customer_id and v.visit_date == data.visit_date and not v.is_deleted:
                    c = customer_service.get_customer(data.customer_id)
                    raise ValueError(f"{c.nickname if c else '该客户'} 当天已经到场")
        now = datetime.now(timezone.utc)
        # 自动分配 sort_order：追加到当天末尾
        dump = data.model_dump()
        if not dump.get("sort_order"):
            max_order = max(
                (v.sort_order for v in _visits.values()
                 if v.visit_date == data.visit_date and not v.is_deleted),
                default=-1,
            )
            dump["sort_order"] = max_order + 1
        record = VisitRecord(
            id=str(uuid.uuid4())[:12],
            created_at=now,
            updated_at=now,
            **dump,
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
    with _visit_lock:
        record = _visits.get(visit_id)
        if not record:
            return None
        old_arrived = record.arrived
        for key, value in data.items():
            if hasattr(record, key) and key not in ("id", "created_at", "created_by"):
                setattr(record, key, value)
        new_arrived = record.arrived
        record.updated_at = datetime.now(timezone.utc)
        _visits[visit_id] = record
        _save(visit_id)
    # 从未到店 → 已到店：执行会员活动扣费
    if not old_arrived and new_arrived:
        _deduct_for_arrival(record)
    # 已到店 → 未到店：退还会员活动扣费
    if old_arrived and not new_arrived:
        _restore_for_arrival(record)
    # 自动刷新会员身份
    from app.services import member_identity_service
    member_identity_service.refresh_member_type(record.customer_id)
    return record


def reorder_visits(ids: list):
    """批量更新排序权重，ids 按期望顺序排列"""
    with _visit_lock:
        for i, vid in enumerate(ids):
            record = _visits.get(vid)
            if record:
                record.sort_order = i
                record.updated_at = datetime.now(timezone.utc)
                _save(vid)


def _deduct_for_arrival(visit):
    """到店扣费：遍历当天所有 session，对参与/主持的人员扣减会员活动次数"""
    from app.services import membership_card_service
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        oh_card_reading_session_service,
    )
    cid = visit.customer_id
    date = visit.visit_date

    with membership_card_service._deduct_lock:
        for s in group_case_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = group_case_session_service._get_chargeable_ids(s)
                if cid in chargeable:
                    membership_card_service._do_deduct(cid, f"gcs:{s.id}")

        for s in emotional_release_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = emotional_release_session_service._get_chargeable_ids(s)
                if cid in chargeable:
                    membership_card_service._do_deduct(cid, f"ers:{s.id}")

        for s in energy_knot_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = set(s.participant_ids)
                chargeable.discard(s.owner_id)
                if cid in chargeable:
                    membership_card_service._do_deduct(cid, f"eks:{s.id}")

        for s in oh_card_reading_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = set(s.participant_ids)
                chargeable.discard(s.owner_id)
                if cid in chargeable:
                    membership_card_service._do_deduct(cid, f"ocr:{s.id}")

        for cr in class_record_service.list_records():
            if cr.date == date and not cr.is_public_welfare:
                chargeable = class_record_service._get_group_member_ids(cr)
                if cid in chargeable:
                    membership_card_service._do_deduct(cid, f"class:{cr.id}")

        membership_card_service._save_deductions()
        membership_card_service._save_debts()


def _restore_for_arrival(visit):
    """取消到场退费：遍历当天所有 session，退还参与/主持人员的会员活动扣费"""
    from app.services import membership_card_service
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        oh_card_reading_session_service,
    )
    cid = visit.customer_id
    date = visit.visit_date

    with membership_card_service._deduct_lock:
        for s in group_case_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = group_case_session_service._get_chargeable_ids(s)
                if cid in chargeable:
                    membership_card_service._do_restore(cid, f"gcs:{s.id}")

        for s in emotional_release_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = emotional_release_session_service._get_chargeable_ids(s)
                if cid in chargeable:
                    membership_card_service._do_restore(cid, f"ers:{s.id}")

        for s in energy_knot_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = set(s.participant_ids)
                chargeable.discard(s.owner_id)
                if cid in chargeable:
                    membership_card_service._do_restore(cid, f"eks:{s.id}")

        for s in oh_card_reading_session_service.list_sessions():
            if s.date == date and not s.is_deleted:
                chargeable = set(s.participant_ids)
                chargeable.discard(s.owner_id)
                if cid in chargeable:
                    membership_card_service._do_restore(cid, f"ocr:{s.id}")

        for cr in class_record_service.list_records():
            if cr.date == date and not cr.is_public_welfare:
                chargeable = class_record_service._get_group_member_ids(cr)
                if cid in chargeable:
                    membership_card_service._do_restore(cid, f"class:{cr.id}")

        membership_card_service._save_deductions()
        membership_card_service._save_debts()


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
    from app.services import membership_card_service

    # 沙龙：teacher_ids, participant_ids, groups
    try:
        for cr in class_record_service.list_records(date=date):
            changed = False
            if customer_id in cr.teacher_ids:
                cr.teacher_ids = [x for x in cr.teacher_ids if x != customer_id]
                changed = True
            if customer_id in cr.participant_ids:
                if not cr.is_public_welfare:
                    membership_card_service._do_restore(customer_id, f"class:{cr.id}")
                cr.participant_ids = [x for x in cr.participant_ids if x != customer_id]
                changed = True
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
                if customer_id != s.owner_id:
                    membership_card_service._do_restore(customer_id, f"gcs:{s.id}")
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
                if customer_id != s.owner_id:
                    membership_card_service._do_restore(customer_id, f"ers:{s.id}")
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
                if customer_id != s.owner_id:
                    membership_card_service._do_restore(customer_id, f"eks:{s.id}")
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
                membership_card_service._do_restore(customer_id, f"ics:{s.id}")
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
                if customer_id != s.owner_id:
                    membership_card_service._do_restore(customer_id, f"ocr:{s.id}")
                s.participant_ids = [x for x in s.participant_ids if x != customer_id]
                changed = True
            if changed:
                oh_card_reading_session_service._save(s.id)
    except Exception:
        logger.exception("清理OH卡梳理记录失败 customer=%s date=%s", customer_id, date)

    # 统一保存扣费/欠费数据
    membership_card_service._save_deductions()
    membership_card_service._save_debts()

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
    with _visit_lock:
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
