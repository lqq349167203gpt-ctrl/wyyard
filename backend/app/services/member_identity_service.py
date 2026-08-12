import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.customer import CustomerUpdate
from app.models.member_identity import IdentityCondition, MemberIdentity, MemberIdentityCreate, MemberIdentityUpdate
from app.services import customer_service
from app.services.storage import load_data, save_data, save_item

FILENAME = "member_identities.json"
_identities: Dict[str, MemberIdentity] = {}


def _load():
    global _identities
    data = load_data(FILENAME)
    _identities = {k: MemberIdentity(**v) for k, v in data.items()}


def _save(identity_id: str = ""):
    if identity_id:
        identity = _identities.get(identity_id)
        if identity:
            save_item(FILENAME, identity_id, identity.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _identities.items()}
        save_data(FILENAME, data)


_load()


def list_identities() -> List[MemberIdentity]:
    return sorted([v for v in _identities.values() if not v.is_deleted], key=lambda x: x.sort_order)


def get_identity(identity_id: str) -> Optional[MemberIdentity]:
    identity = _identities.get(identity_id)
    if identity and identity.is_deleted:
        return None
    return identity


def create_identity(data: MemberIdentityCreate) -> MemberIdentity:
    if not data.name or not data.name.strip():
        raise ValueError("身份名称不能为空")
    now = datetime.now(timezone.utc)
    max_order = max((i.sort_order for i in _identities.values()), default=-1)
    identity_data = data.model_dump()
    identity_data["sort_order"] = max_order + 1
    identity = MemberIdentity(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **identity_data,
    )
    _identities[identity.id] = identity
    _save(identity.id)
    return identity


_UPDATE_EXCLUDE_KEYS = {"id", "created_at", "created_by", "sort_order", "is_deleted", "deleted_at"}


def update_identity(identity_id: str, data: MemberIdentityUpdate) -> Optional[MemberIdentity]:
    identity = _identities.get(identity_id)
    if not identity:
        return None
    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data and (not update_data["name"] or not update_data["name"].strip()):
        raise ValueError("身份名称不能为空")
    old_name = identity.name if "name" in update_data else None
    for key, value in update_data.items():
        if hasattr(identity, key) and key not in _UPDATE_EXCLUDE_KEYS:
            setattr(identity, key, value)
    identity.updated_at = datetime.now(timezone.utc)
    _identities[identity_id] = identity
    _save(identity_id)
    # 身份改名时同步权限配置
    if old_name and old_name != identity.name:
        from app.services.position_customer_permission_service import rename_identity_in_permissions
        rename_identity_in_permissions(old_name, identity.name)
        # 同步活动权限
        try:
            from app.services.activity_permission_service import rename_identity as rename_ap
            rename_ap(old_name, identity.name)
        except Exception:
            pass
    return identity


def reorder(ids: list) -> list:
    """按传入的 ID 顺序更新 sort_order，返回变更描述列表"""
    active = sorted([v for v in _identities.values() if not v.is_deleted], key=lambda x: x.sort_order)
    before_order = {v.id: i for i, v in enumerate(active)}

    changes = []
    for i, identity_id in enumerate(ids):
        identity = _identities.get(identity_id)
        if identity:
            old_pos = before_order.get(identity_id, -1)
            if old_pos != i:
                changes.append(f"{identity.name}（{old_pos + 1}→{i + 1}）")
            identity.sort_order = i
            identity.updated_at = datetime.now(timezone.utc)
    _save()
    return changes


def delete_identity(identity_id: str) -> bool:
    identity = _identities.get(identity_id)
    if not identity:
        return False
    identity.is_deleted = True
    identity.deleted_at = datetime.now(timezone.utc)
    _save(identity_id)
    # 从权限配置中移除已删除的身份
    try:
        from app.services.position_customer_permission_service import remove_identity_from_permissions
        remove_identity_from_permissions(identity.name)
    except Exception:
        pass
    # 从活动权限配置中移除已删除的身份
    try:
        from app.services.activity_permission_service import remove_identity as remove_ap
        remove_ap(identity.name)
    except Exception:
        pass
    return True


def _compare_count(actual, op: str, target) -> bool:
    if op == ">":
        return actual > target
    elif op == ">=":
        return actual >= target
    elif op == "=":
        return actual == target
    elif op == "<=":
        return actual <= target
    elif op == "<":
        return actual < target
    return False


def _get_payment_categories(condition: IdentityCondition) -> list:
    """获取付费项目类别，兼容旧 card/course 类型"""
    if condition.type == "card":
        return ["会员卡"]
    if condition.type == "course":
        return ["内部课程"]
    cats = condition.payment_categories or []
    return ["会员卡" if c == "会员活动" else c for c in cats]


def _check_condition(condition, customer_id: str,
                     arrival_count: int, activity_count: int,
                     customer_cards, customer_courses, customer_group_cases,
                     customer_emotional_releases, customer_energy_knots,
                     customer_oh_card_readings, customer_other_projects, today_str: str,
                     welfare_count: int = 0, customer_positions: list = None,
                     customer_nickname: str = "", customer_total_payment: float = 0) -> bool:
    if isinstance(condition, dict):
        condition = IdentityCondition(**condition)
    t = condition.type
    if t == "arrival":
        return _compare_count(arrival_count, condition.count_op, condition.count_value)
    elif t == "activity":
        count = welfare_count if condition.activity_scope == "welfare" else activity_count
        return _compare_count(count, condition.count_op, condition.count_value)
    elif t == "teacher":
        positions = customer_positions or []
        if not condition.items:
            return False
        return any(p in positions for p in condition.items)
    elif t == "fixed":
        return customer_nickname in (condition.items or [])
    elif t == "amount":
        return _compare_count(int(customer_total_payment), condition.count_op, condition.count_value)
    elif t in ("card", "course", "payment"):
        cats = _get_payment_categories(condition)
        item_set = set(condition.items) if condition.items else set()
        for cat in cats:
            if cat == "会员卡":
                for c in customer_cards:
                    if c.voided:
                        continue
                    if item_set and c.card_type not in item_set:
                        continue
                    if condition.validity == "active" and c.expiry_date and c.expiry_date < today_str:
                        continue
                    return True
            elif cat == "内部课程":
                for c in customer_courses:
                    if item_set and c.course_type not in item_set:
                        continue
                    if condition.validity == "active" and c.expiry_date and c.expiry_date < today_str:
                        continue
                    return True
            elif cat == "觉醒游戏":
                total = sum(c.purchase_count for c in customer_group_cases)
                if _compare_count(total, condition.count_op, condition.count_value):
                    return True
            elif cat == "情绪释放":
                total = sum(c.purchase_count for c in customer_emotional_releases)
                if _compare_count(total, condition.count_op, condition.count_value):
                    return True
            elif cat == "能量结":
                total = sum(c.purchase_count for c in customer_energy_knots)
                if _compare_count(total, condition.count_op, condition.count_value):
                    return True
            elif cat == "OH卡诊断":
                total = sum(c.purchase_count for c in customer_oh_card_readings)
                if _compare_count(total, condition.count_op, condition.count_value):
                    return True
            elif cat == "其他项目":
                items = customer_other_projects
                if condition.validity == "active":
                    items = [p for p in items if not p.expiry_date or p.expiry_date >= today_str]
                total = len(items)
                if _compare_count(total, condition.count_op, condition.count_value):
                    return True
        return False
    return False


def _count_activity_days(customer_id: str, all_class_records, all_group_cases,
                         all_emotional_releases, all_energy_knots, all_internal_courses,
                         customer_visits=None) -> int:
    """统计客户参与过活动的天数（至少参与1个活动算1天，必须实际到店）"""
    from app.services import class_record_service

    # 构建已到店日期集合
    arrived_dates: set[str] = set()
    if customer_visits:
        arrived_dates = {v.visit_date for v in customer_visits if v.arrived}

    active_dates: set[str] = set()
    for r in all_class_records:
        if customer_id in class_record_service._get_group_member_ids(r):
            if r.date and (not customer_visits or r.date in arrived_dates):
                active_dates.add(r.date)
    for s in all_group_cases:
        ids = set(s.participant_ids or [])
        if s.owner_id:
            ids.add(s.owner_id)
        if s.host_id:
            ids.add(s.host_id)
        ids.update(s.teacher_ids or [])
        if customer_id in ids and s.date and (not customer_visits or s.date in arrived_dates):
            active_dates.add(s.date)
    for s in all_emotional_releases:
        ids = set(s.participant_ids or [])
        if s.owner_id:
            ids.add(s.owner_id)
        if s.host_id:
            ids.add(s.host_id)
        ids.update(s.teacher_ids or [])
        if customer_id in ids and s.date and (not customer_visits or s.date in arrived_dates):
            active_dates.add(s.date)
    for s in all_energy_knots:
        ids = set(s.participant_ids or [])
        if s.owner_id:
            ids.add(s.owner_id)
        if s.host_id:
            ids.add(s.host_id)
        ids.update(s.teacher_ids or [])
        if customer_id in ids and s.date and (not customer_visits or s.date in arrived_dates):
            active_dates.add(s.date)
    for s in all_internal_courses:
        ids = set(s.participant_ids or [])
        ids.update(s.teacher_ids or [])
        if customer_id in ids and s.date and (not customer_visits or s.date in arrived_dates):
            active_dates.add(s.date)
    return len(active_dates)


def refresh_member_type(customer_id: str):
    """根据管理员已配置的身份规则刷新 member_type，不从卡类型名称推测或补建规则。"""
    customer = customer_service.get_customer(customer_id)
    if not customer:
        return

    identities = list_identities()
    today_str = datetime.now().strftime("%Y-%m-%d")

    # 预计算用户数据
    from app.services import (
        class_record_service,
        emotional_release_service,
        emotional_release_session_service,
        energy_knot_service,
        energy_knot_session_service,
        group_case_service,
        group_case_session_service,
        internal_course_service,
        internal_course_session_service,
        membership_card_service,
        oh_card_reading_service,
        other_project_service,
        tea_seat_fee_service,
        offline_course_service,
        visit_service,
    )

    all_cards = membership_card_service.list_cards()
    customer_cards = [c for c in all_cards if c.customer_id == customer_id and not c.voided]

    all_courses = internal_course_service.list_courses()
    customer_courses = [c for c in all_courses if c.customer_id == customer_id]

    all_group_cases = group_case_service.list_cases()
    customer_group_cases = [c for c in all_group_cases if c.customer_id == customer_id]

    all_emotional_releases = emotional_release_service.list_releases()
    customer_emotional_releases = [c for c in all_emotional_releases if c.customer_id == customer_id]

    all_energy_knots = energy_knot_service.list_knots()
    customer_energy_knots = [c for c in all_energy_knots if c.customer_id == customer_id]

    all_oh_card_readings = oh_card_reading_service.list_readings()
    customer_oh_card_readings = [c for c in all_oh_card_readings if c.customer_id == customer_id]

    all_offline_courses = offline_course_service.list_courses()
    customer_offline_courses = [c for c in all_offline_courses if c.customer_id == customer_id]

    all_tea_seat_fees = tea_seat_fee_service.list_fees()
    customer_tea_seat_fees = [c for c in all_tea_seat_fees if c.customer_id == customer_id]

    all_other_projects = other_project_service.list_projects()
    customer_other_projects = [c for c in all_other_projects if c.customer_id == customer_id]

    all_visits = visit_service.list_visits()
    customer_visits = [v for v in all_visits if v.customer_id == customer_id]
    arrival_count = len({v.visit_date for v in customer_visits if v.arrived})

    # 从实际活动数据源统计参与天数
    all_records = class_record_service.list_records()
    all_gc_sessions = group_case_session_service.list_sessions()
    all_er_sessions = emotional_release_session_service.list_sessions()
    all_ek_sessions = energy_knot_session_service.list_sessions()
    all_ic_sessions = internal_course_session_service.list_sessions()
    activity_count = _count_activity_days(customer_id, all_records, all_gc_sessions,
                                          all_er_sessions, all_ek_sessions, all_ic_sessions,
                                          customer_visits)

    # 公益活动参与次数
    welfare_count = sum(1 for r in all_records if r.is_public_welfare and customer_id in (r.participant_ids or []))

    # 客户职位
    customer_positions = customer.positions or []

    # 消费总额
    from app.services import project_refund_service
    customer_total_payment = 0.0
    for c in customer_cards:
        customer_total_payment += c.price
    for c in customer_group_cases:
        customer_total_payment += c.amount
    for r in customer_emotional_releases:
        customer_total_payment += r.amount
    for k in customer_energy_knots:
        customer_total_payment += k.amount
    for c in customer_courses:
        customer_total_payment += c.price
    for r in customer_oh_card_readings:
        customer_total_payment += r.amount
    for t in customer_tea_seat_fees:
        customer_total_payment += t.amount
    for c in customer_offline_courses:
        customer_total_payment += c.amount
    for p in customer_other_projects:
        customer_total_payment += p.fee
    for r in project_refund_service.list_refunds(customer_id=customer_id):
        customer_total_payment -= r.refund_amount
    customer_total_payment = max(customer_total_payment, 0)

    # 按 sort_order 顺序匹配，第一条命中即为身份
    member_type = ""
    for identity in identities:
        if not identity.conditions:
            member_type = identity.name
            break
        results = [_check_condition(cond, customer_id, arrival_count, activity_count,
                                    customer_cards, customer_courses,
                                    customer_group_cases, customer_emotional_releases,
                                    customer_energy_knots, customer_oh_card_readings,
                                    customer_other_projects, today_str,
                                    welfare_count, customer_positions,
                                    customer.nickname or "", customer_total_payment)
                   for cond in identity.conditions]
        if identity.operator == "any":
            matched = any(results)
        else:
            matched = all(results)
        if matched:
            member_type = identity.name
            break

    if customer.member_type != member_type:
        customer_service.update_customer(customer_id, CustomerUpdate(member_type=member_type))


def refresh_all():
    """批量刷新所有用户的 member_type，共享数据源避免重复加载"""
    from app.services import (
        class_record_service,
        emotional_release_service,
        emotional_release_session_service,
        energy_knot_service,
        energy_knot_session_service,
        group_case_service,
        group_case_session_service,
        internal_course_service,
        internal_course_session_service,
        membership_card_service,
        oh_card_reading_service,
        other_project_service,
        tea_seat_fee_service,
        offline_course_service,
        visit_service,
    )

    identities = list_identities()
    today_str = datetime.now().strftime("%Y-%m-%d")

    # 全局数据只加载一次
    all_cards = membership_card_service.list_cards()
    all_courses = internal_course_service.list_courses()
    all_group_cases = group_case_service.list_cases()
    all_emotional_releases = emotional_release_service.list_releases()
    all_energy_knots = energy_knot_service.list_knots()
    all_oh_card_readings = oh_card_reading_service.list_readings()
    all_offline_courses = offline_course_service.list_courses()
    all_tea_seat_fees = tea_seat_fee_service.list_fees()
    all_other_projects = other_project_service.list_projects()
    all_visits = visit_service.list_visits()
    all_records = class_record_service.list_records()

    # 活动 session 数据（用于统计活动参与天数）
    all_gc_sessions = group_case_session_service.list_sessions()
    all_er_sessions = emotional_release_session_service.list_sessions()
    all_ek_sessions = energy_knot_session_service.list_sessions()
    all_ic_sessions = internal_course_session_service.list_sessions()

    # 退款金额按客户汇总
    from app.services import project_refund_service
    refund_map: dict[str, float] = {}
    for r in project_refund_service.list_refunds():
        refund_map[r.customer_id] = refund_map.get(r.customer_id, 0) + r.refund_amount

    # 预计算每个客户的到店天数、活动参与天数、公益活动次数
    arrival_dates_map: dict[str, set[str]] = {}
    activity_dates_map: dict[str, set[str]] = {}
    welfare_map: dict[str, int] = {}

    for v in all_visits:
        if v.arrived and v.visit_date:
            arrival_dates_map.setdefault(v.customer_id, set()).add(v.visit_date)
    arrival_map: dict[str, int] = {cid: len(dates) for cid, dates in arrival_dates_map.items()}

    # 从实际活动数据源统计参与天数（必须实际到店）
    def _add_activity_date(cid: str, date: str):
        if cid and date:
            # 只有实际到店的日期才算活动参与
            if cid in arrival_dates_map and date in arrival_dates_map[cid]:
                activity_dates_map.setdefault(cid, set()).add(date)

    for r in all_records:
        if r.is_public_welfare:
            for pid in (r.participant_ids or []):
                welfare_map[pid] = welfare_map.get(pid, 0) + 1
        member_ids = class_record_service._get_group_member_ids(r)
        for cid in member_ids:
            _add_activity_date(cid, r.date)

    for s in all_gc_sessions:
        ids = set(s.participant_ids or [])
        if s.owner_id:
            ids.add(s.owner_id)
        if s.host_id:
            ids.add(s.host_id)
        ids.update(s.teacher_ids or [])
        for cid in ids:
            _add_activity_date(cid, s.date)

    for s in all_er_sessions:
        ids = set(s.participant_ids or [])
        if s.owner_id:
            ids.add(s.owner_id)
        if s.host_id:
            ids.add(s.host_id)
        ids.update(s.teacher_ids or [])
        for cid in ids:
            _add_activity_date(cid, s.date)

    for s in all_ek_sessions:
        ids = set(s.participant_ids or [])
        if s.owner_id:
            ids.add(s.owner_id)
        if s.host_id:
            ids.add(s.host_id)
        ids.update(s.teacher_ids or [])
        for cid in ids:
            _add_activity_date(cid, s.date)

    for s in all_ic_sessions:
        ids = set(s.participant_ids or [])
        ids.update(s.teacher_ids or [])
        for cid in ids:
            _add_activity_date(cid, s.date)

    customers = customer_service.list_customers()
    for c in customers:
        customer_cards = [x for x in all_cards if x.customer_id == c.id and not x.voided]
        customer_courses = [x for x in all_courses if x.customer_id == c.id]
        customer_group_cases = [x for x in all_group_cases if x.customer_id == c.id]
        customer_emotional_releases = [x for x in all_emotional_releases if x.customer_id == c.id]
        customer_energy_knots = [x for x in all_energy_knots if x.customer_id == c.id]
        customer_oh_card_readings = [x for x in all_oh_card_readings if x.customer_id == c.id]
        customer_tea_seat_fees = [x for x in all_tea_seat_fees if x.customer_id == c.id]
        customer_offline_courses = [x for x in all_offline_courses if x.customer_id == c.id]
        customer_other_projects = [x for x in all_other_projects if x.customer_id == c.id]
        arrival_count = arrival_map.get(c.id, 0)
        activity_count = len(activity_dates_map.get(c.id, set()))
        welfare_count = welfare_map.get(c.id, 0)
        customer_positions = c.positions or []

        # 消费总额
        customer_total_payment = 0.0
        for x in customer_cards:
            customer_total_payment += x.price
        for x in customer_group_cases:
            customer_total_payment += x.amount
        for x in customer_emotional_releases:
            customer_total_payment += x.amount
        for x in customer_energy_knots:
            customer_total_payment += x.amount
        for x in customer_courses:
            customer_total_payment += x.price
        for x in customer_oh_card_readings:
            customer_total_payment += x.amount
        for x in customer_tea_seat_fees:
            customer_total_payment += x.amount
        for x in customer_offline_courses:
            customer_total_payment += x.amount
        for x in customer_other_projects:
            customer_total_payment += x.fee
        customer_total_payment -= refund_map.get(c.id, 0)
        customer_total_payment = max(customer_total_payment, 0)

        member_type = ""
        for identity in identities:
            if not identity.conditions:
                member_type = identity.name
                break
            results = [_check_condition(cond, c.id, arrival_count, activity_count,
                                        customer_cards, customer_courses,
                                        customer_group_cases, customer_emotional_releases,
                                        customer_energy_knots, customer_oh_card_readings,
                                        customer_other_projects, today_str,
                                        welfare_count, customer_positions,
                                        c.nickname or "", customer_total_payment)
                       for cond in identity.conditions]
            if identity.operator == "any":
                matched = any(results)
            else:
                matched = all(results)
            if matched:
                member_type = identity.name
                break

        if c.member_type != member_type:
            customer_service.update_customer(c.id, CustomerUpdate(member_type=member_type))
