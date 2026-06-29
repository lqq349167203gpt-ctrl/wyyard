import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.member_identity import MemberIdentity, MemberIdentityCreate, MemberIdentityUpdate, IdentityCondition
from app.models.customer import CustomerUpdate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

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
    now = datetime.now(timezone.utc)
    max_order = max((i.sort_order for i in _identities.values()), default=-1)
    identity_data = data.model_dump()
    identity_data["sort_order"] = max_order + 1
    identity = MemberIdentity(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **identity_data,
    )
    _identities[identity.id] = identity
    _save(identity.id)
    return identity


def update_identity(identity_id: str, data: MemberIdentityUpdate) -> Optional[MemberIdentity]:
    identity = _identities.get(identity_id)
    if not identity:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(identity, key) and key not in ("id", "created_at", "created_by"):
            setattr(identity, key, value)
    identity.updated_at = datetime.now(timezone.utc)
    _identities[identity_id] = identity
    _save(identity_id)
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
    return True


def _compare_count(actual: int, op: str, target: int) -> bool:
    if op == ">":
        return actual > target
    elif op == "=":
        return actual == target
    elif op == "<":
        return actual < target
    return False


def _get_payment_categories(condition: IdentityCondition) -> list:
    """获取付费项目类别，兼容旧 card/course 类型"""
    if condition.type == "card":
        return ["会员活动"]
    if condition.type == "course":
        return ["内部课程"]
    cats = condition.payment_categories or []
    return ["会员活动" if c == "会员卡" else c for c in cats]


def _check_condition(condition, customer_id: str,
                     arrival_count: int, activity_count: int,
                     customer_cards, customer_courses, customer_group_cases,
                     customer_emotional_releases, customer_energy_knots,
                     customer_oh_card_readings, customer_other_projects, today_str: str) -> bool:
    if isinstance(condition, dict):
        condition = IdentityCondition(**condition)
    t = condition.type
    if t == "arrival":
        return _compare_count(arrival_count, condition.count_op, condition.count_value)
    elif t == "activity":
        return _compare_count(activity_count, condition.count_op, condition.count_value)
    elif t in ("card", "course", "payment"):
        cats = _get_payment_categories(condition)
        item_set = set(condition.items) if condition.items else set()
        for cat in cats:
            if cat == "会员活动":
                for c in customer_cards:
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
            elif cat == "OH卡梳理":
                total = sum(c.purchase_count for c in customer_oh_card_readings)
                if _compare_count(total, condition.count_op, condition.count_value):
                    return True
            elif cat == "其他项目":
                total = len(customer_other_projects)
                if _compare_count(total, condition.count_op, condition.count_value):
                    return True
        return False
    return False


def refresh_member_type(customer_id: str):
    """根据配置的会员身份规则自动刷新用户的 member_type"""
    customer = customer_service.get_customer(customer_id)
    if not customer:
        return

    identities = list_identities()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 预计算用户数据
    from app.services import membership_card_service, visit_service, internal_course_service
    from app.services import group_case_service, emotional_release_service, energy_knot_service
    from app.services import oh_card_reading_service, other_project_service
    all_cards = membership_card_service.list_cards()
    customer_cards = [c for c in all_cards if c.customer_id == customer_id]

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

    all_other_projects = other_project_service.list_projects()
    customer_other_projects = [c for c in all_other_projects if c.customer_id == customer_id]

    all_visits = visit_service.list_visits()
    customer_visits = [v for v in all_visits if v.customer_id == customer_id]
    arrival_count = sum(1 for v in customer_visits if v.arrived)
    activity_count = sum(1 for v in customer_visits if v.activity_id)

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
                                    customer_other_projects, today_str)
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
    from app.services import membership_card_service, visit_service, internal_course_service
    from app.services import group_case_service, emotional_release_service, energy_knot_service
    from app.services import oh_card_reading_service, other_project_service

    identities = list_identities()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 全局数据只加载一次
    all_cards = membership_card_service.list_cards()
    all_courses = internal_course_service.list_courses()
    all_group_cases = group_case_service.list_cases()
    all_emotional_releases = emotional_release_service.list_releases()
    all_energy_knots = energy_knot_service.list_knots()
    all_oh_card_readings = oh_card_reading_service.list_readings()
    all_other_projects = other_project_service.list_projects()
    all_visits = visit_service.list_visits()

    customers = customer_service.list_customers()
    for c in customers:
        customer_cards = [x for x in all_cards if x.customer_id == c.id]
        customer_courses = [x for x in all_courses if x.customer_id == c.id]
        customer_group_cases = [x for x in all_group_cases if x.customer_id == c.id]
        customer_emotional_releases = [x for x in all_emotional_releases if x.customer_id == c.id]
        customer_energy_knots = [x for x in all_energy_knots if x.customer_id == c.id]
        customer_oh_card_readings = [x for x in all_oh_card_readings if x.customer_id == c.id]
        customer_other_projects = [x for x in all_other_projects if x.customer_id == c.id]
        customer_visits = [v for v in all_visits if v.customer_id == c.id]
        arrival_count = sum(1 for v in customer_visits if v.arrived)
        activity_count = sum(1 for v in customer_visits if v.activity_id)

        member_type = ""
        for identity in identities:
            if not identity.conditions:
                member_type = identity.name
                break
            results = [_check_condition(cond, c.id, arrival_count, activity_count,
                                        customer_cards, customer_courses,
                                        customer_group_cases, customer_emotional_releases,
                                        customer_energy_knots, customer_oh_card_readings,
                                        customer_other_projects, today_str)
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
