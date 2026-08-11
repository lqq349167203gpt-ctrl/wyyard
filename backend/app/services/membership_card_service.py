import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from dateutil.relativedelta import relativedelta

from app.models.membership_card import MembershipCard, MembershipCardCreate
from app.services import customer_service
from app.services.storage import load_data, save_data, save_item

FILENAME = "membership_cards.json"
DEDUCTIONS_FILE = "membership_deductions.json"
DEBTS_FILE = "membership_debts.json"
DEBT_ACTIVITIES_FILE = "membership_debt_activities.json"
_cards: Dict[str, MembershipCard] = {}
# 追踪已扣费记录：{customer_id: [{key: activity_key, card_id: str|None}, ...]}
# 元素为 dict 时 card_id 表示本次活动扣卡是从哪张会员卡扣的；老数据可能是裸字符串，等价 card_id=None
_deductions: Dict[str, list] = {}
# 追踪欠费记录：{customer_id: debt_count}
_debts: Dict[str, int] = {}
# 追踪欠费对应的活动：{customer_id: [activity_key, ...]}
_debt_activities: Dict[str, list] = {}
# 并发锁：保护 deduct_for_activity / restore_for_activity 的原子性
_deduct_lock = threading.Lock()
# 并发锁：保护 create_card / update_card / delete_card / void_card / unvoid_card
_card_lock = threading.Lock()
_ACTIVITY_UNIT_SEPARATOR = "#unit="


def _migrate_closers(item: MembershipCard) -> MembershipCard:
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]
    return item


def _migrate_total_count(item: MembershipCard) -> MembershipCard:
    if item.total_count is None and item.remaining_count is not None:
        item.total_count = item.remaining_count
    return item


def _migrate_deductions(raw):
    """兼容老数据并排除不产生会员卡扣费的活动流水。"""
    out: Dict[str, list] = {}
    for customer_id, items in (raw or {}).items():
        migrated = []
        for it in items:
            activity_key = it.get("key") if isinstance(it, dict) else it
            if isinstance(activity_key, str) and activity_key.startswith(("ics:", "eks:")):
                continue
            if isinstance(it, dict):
                migrated.append({
                    "key": activity_key,
                    "card_id": it.get("card_id"),
                    "benefit_type": it.get("benefit_type", ""),
                    "benefit_id": it.get("benefit_id", ""),
                    "benefit_name": it.get("benefit_name", ""),
                    "remaining_after": it.get("remaining_after"),
                    "deducted_at": it.get("deducted_at"),
                })
            else:
                migrated.append({
                    "key": it,
                    "card_id": None,
                    "benefit_type": "",
                    "benefit_id": "",
                    "benefit_name": "",
                    "remaining_after": None,
                    "deducted_at": None,
                })
        if migrated:
            out[customer_id] = migrated
    return out


def _load():
    global _cards, _deductions, _debts, _debt_activities
    data = load_data(FILENAME)
    _cards = {}
    for k, v in data.items():
        _cards[k] = _migrate_total_count(_migrate_closers(MembershipCard(**v)))
    _deductions = _migrate_deductions(load_data(DEDUCTIONS_FILE))
    raw_debts = load_data(DEBTS_FILE) or {}
    raw_debt_activities = load_data(DEBT_ACTIVITIES_FILE) or {}
    _debt_activities = {}
    _debts = {}
    for customer_id, activity_keys in raw_debt_activities.items():
        filtered_keys = [
            key for key in activity_keys
            if not (
                isinstance(key, str)
                and key.startswith(("ics:", "eks:"))
            )
        ]
        removed_count = len(activity_keys) - len(filtered_keys)
        if filtered_keys:
            _debt_activities[customer_id] = filtered_keys
        remaining_debt = max(0, int(raw_debts.get(customer_id, 0) or 0) - removed_count)
        if remaining_debt:
            _debts[customer_id] = remaining_debt
    for customer_id, debt_count in raw_debts.items():
        if customer_id not in raw_debt_activities and debt_count:
            _debts[customer_id] = debt_count


def _save(card_id: str = ""):
    if card_id:
        item = _cards.get(card_id)
        if item:
            save_item(FILENAME, card_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _cards.items()}
        save_data(FILENAME, data)


def _save_deductions():
    save_data(DEDUCTIONS_FILE, _deductions)


def list_activity_usage_records(customer_id: str) -> list[dict]:
    """返回客户的活动权益使用记录副本，供统一销卡记录接口读取。"""
    reconcile_customer_card_usage(customer_id)
    return [
        dict(item) if isinstance(item, dict) else {"key": str(item), "card_id": None}
        for item in _deductions.get(customer_id, [])
    ]


def list_debt_activity_usage_records(customer_id: str) -> list[dict]:
    """返回没有可用会员权益时形成的活动欠卡流水。"""
    reconcile_customer_card_usage(customer_id)
    activity_keys = sorted(
        _debt_activities.get(customer_id, []),
        key=lambda key: (_get_activity_date(key) or "9999-12-31", key),
    )
    return [
        {
            "key": activity_key,
            "benefit_type": "membership_debt",
            "benefit_name": "预支扣卡",
            "remaining_after": -index,
        }
        for index, activity_key in enumerate(activity_keys, start=1)
    ]


def _save_debts():
    save_data(DEBTS_FILE, _debts)
    save_data(DEBT_ACTIVITIES_FILE, _debt_activities)


def get_debt(customer_id: str) -> int:
    """获取用户的欠费次数（仅统计有对应活动记录的欠费，排除旧系统脏数据）"""
    raw = _debts.get(customer_id, 0)
    if raw <= 0:
        return 0
    # 只有 _debt_activities 里有记录的欠费才算数
    tracked = len(_debt_activities.get(customer_id, []))
    return min(raw, tracked)


def _active_cards(customer_id: str, today: Optional[str] = None) -> List[MembershipCard]:
    """获取某用户在有效期内的卡（已生效、未过期、未删除、未作废）"""
    if today is None:
        today = datetime.now().strftime("%Y-%m-%d")
    return [
        c for c in list_cards()
        if c.customer_id == customer_id
        and not c.voided
        and (not c.effective_date or c.effective_date <= today)
        and (not c.expiry_date or c.expiry_date >= today)
    ]


def filter_arrived_customer_ids(date: str, customer_ids: set) -> set:
    """只保留当日已确认到场的客户，活动名单本身不再触发扣卡。"""
    from app.services import visit_service

    arrived_ids = {
        visit.customer_id
        for visit in visit_service.list_visits(date=date)
        if visit.arrived and not visit.is_deleted
    }
    return set(customer_ids) & arrived_ids


def void_card(card_id: str) -> Optional[MembershipCard]:
    """作废会员卡（退费后调用）：卡不再可用于扣费，但保留记录和已扣次数"""
    with _card_lock:
        card = _cards.get(card_id)
        if not card or card.is_deleted:
            return None
        card.voided = True
        card.voided_at = datetime.now(timezone.utc)
        card.updated_at = datetime.now(timezone.utc)
        _cards[card_id] = card
        save_item(FILENAME, card_id, card.model_dump(mode="json"))
    _refresh_member_type(card.customer_id)
    return card


def is_card_voided(card_id: str) -> bool:
    """判断卡是否已作废（退费）"""
    card = _cards.get(card_id)
    return bool(card and card.voided)


def unvoid_card(card_id: str) -> Optional[MembershipCard]:
    """恢复作废的会员卡（撤销退费时调用）"""
    with _card_lock:
        card = _cards.get(card_id)
        if not card or card.is_deleted:
            return None
        card.voided = False
        card.voided_at = None
        card.updated_at = datetime.now(timezone.utc)
        _cards[card_id] = card
        save_item(FILENAME, card_id, card.model_dump(mode="json"))
    _refresh_member_type(card.customer_id)
    return card


def get_grand_total(customer_id: str) -> int:
    """总购买次数（所有未删除、未作废的次数卡 total_count 之和；不限次卡不计入）"""
    return sum(
        (c.total_count or 0)
        for c in list_cards()
        if c.customer_id == customer_id and c.remaining_count is not None and not c.voided
    )


def _get_active_card_ids(customer_id: str) -> set:
    """获取该用户有效的会员卡 ID 集合（未删除、未作废），用于对齐 grand_total 的过滤逻辑"""
    return {c.id for c in list_cards()
            if c.customer_id == customer_id and not c.voided}


def get_manual_deductions(customer_id: str) -> int:
    """销卡次数（来自 project_deduction 流水，project_type=membership-cards，排除已作废/已删除卡的流水）"""
    from app.services import project_deduction_service
    active_ids = _get_active_card_ids(customer_id)
    total = 0
    for d in project_deduction_service._deductions.values():
        if (d.customer_id == customer_id
                and d.project_type == "membership-cards"
                and not d.is_deleted
                and d.project_id in active_ids):
            total += d.count
    return total


def _count_raw_activities(customer_id: str) -> int:
    """统计该用户实际参与的活动总数（原始计数，不考虑卡和内部课程）"""
    from app.services import (
        class_record_service,
        emotional_release_session_service,
        group_case_session_service,
        visit_service,
    )
    arrived_dates = {v.visit_date for v in visit_service._visits.values()
                     if v.customer_id == customer_id and v.arrived and not v.is_deleted}
    if not arrived_dates:
        return 0
    count = 0
    for cr in class_record_service.list_records():
        if not cr.is_deleted and not cr.is_public_welfare and cr.date in arrived_dates:
            if customer_id in class_record_service._get_group_member_ids(cr):
                count += 1
    for s in group_case_session_service.list_sessions():
        if not s.is_deleted and s.date in arrived_dates:
            if customer_id in group_case_session_service._get_chargeable_ids(s):
                count += 1
    for s in emotional_release_session_service.list_sessions():
        if not s.is_deleted and s.date in arrived_dates:
            if customer_id in emotional_release_session_service._get_chargeable_ids(s):
                count += 1
    return count


def get_activity_deductions(customer_id: str) -> int:
    """活动扣卡次数（只统计实际使用次数卡的记录）。"""
    today = datetime.now().strftime("%Y-%m-%d")
    active = _active_cards(customer_id, today)
    countable = [c for c in active if c.remaining_count is not None]
    if not countable:
        return 0

    countable_ids = {card.id for card in countable}
    records = _deductions.get(customer_id, [])
    tracked = sum(
        1
        for item in records
        if isinstance(item, dict) and item.get("card_id") in countable_ids
    )

    # 兼容未记录 card_id 的历史数据，仅在次数卡剩余容量内补算。
    legacy_untracked = sum(
        1
        for item in records
        if not isinstance(item, dict)
        or (
            not item.get("card_id")
            and not item.get("benefit_type")
            and not item.get("benefit_id")
        )
    )
    if legacy_untracked <= 0:
        return tracked

    from app.services import project_deduction_service
    total_capacity = sum(
        max(
            0,
            (card.total_count or 0)
            - project_deduction_service.get_deduction_total_for_project(card.id),
        )
        for card in countable
    )
    actual_legacy = min(legacy_untracked, _count_raw_activities(customer_id))
    return tracked + min(actual_legacy, max(0, total_capacity - tracked))


def get_card_manual_deductions(card_id: str) -> int:
    """该卡已被销卡流水扣除的次数（按 project_id=card_id 过滤）"""
    from app.services import project_deduction_service
    return project_deduction_service.get_deduction_total_for_project(card_id)


def get_card_activity_deductions(card_id: str) -> int:
    """该卡活动扣卡次数（仅统计明确记录到该卡的新流水；老数据未分卡不计）"""
    return _get_card_activity_deductions_count(card_id)


def has_untracked_deductions(customer_id: str) -> bool:
    """该用户是否存在未分卡的老扣费记录（card_id=None）"""
    for item in _deductions.get(customer_id, []):
        card_id = item.get("card_id") if isinstance(item, dict) else None
        if card_id is None:
            return True
    return False


def get_card_effective_remaining(card_id: str) -> Optional[int]:
    """该卡的真实剩余次数：total_count - 销卡流水 - 有 card_id 的活动扣卡流水。

    None 表示不限次卡；老数据活动扣卡未分卡时本函数只能反映销卡部分，结果可能偏大，
    用于"每张卡尾部显示"时由调用方退化到聚合分摊或单卡总剩余。
    """
    card = _cards.get(card_id)
    if not card:
        return 0
    if card.remaining_count is None:
        return None
    if card.total_count is None:
        return None
    manual = get_card_manual_deductions(card_id)
    activity = get_card_activity_deductions(card_id)
    return max(0, (card.total_count or 0) - manual - activity)


def get_activity_deduction_count(activity) -> int:
    """获取单个参与者在该场活动中需要扣除的会员卡次数。"""
    try:
        return max(1, int(getattr(activity, "membership_deduction_count", 1)))
    except (TypeError, ValueError):
        return 1


def _base_activity_key(activity_key: str) -> str:
    """移除多次扣卡的单位后缀，得到活动自身的稳定键。"""
    return activity_key.split(_ACTIVITY_UNIT_SEPARATOR, 1)[0]


def _activity_unit_key(activity_key: str, unit_index: int) -> str:
    """第一次沿用历史键，后续次数使用可独立撤销的单位键。"""
    if unit_index <= 1:
        return activity_key
    return f"{activity_key}{_ACTIVITY_UNIT_SEPARATOR}{unit_index}"


def _activity_unit_index(activity_key: str) -> int:
    if _ACTIVITY_UNIT_SEPARATOR not in activity_key:
        return 1
    try:
        return max(1, int(activity_key.rsplit(_ACTIVITY_UNIT_SEPARATOR, 1)[1]))
    except (TypeError, ValueError):
        return 1


def _get_activity_date(activity_key: str) -> Optional[str]:
    """根据 activity_key（如 class:xxx, gcs:xxx）查找活动日期"""
    from app.services import (
        class_record_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
    )
    activity_key = _base_activity_key(activity_key)
    if ':' not in activity_key:
        return None
    type_prefix, item_id = activity_key.split(':', 1)
    try:
        if type_prefix == 'class':
            r = class_record_service.get_record(item_id)
            return r.date if r else None
        elif type_prefix == 'gcs':
            s = group_case_session_service.get_session(item_id)
            return s.date if s else None
        elif type_prefix == 'ers':
            s = emotional_release_session_service.get_session(item_id)
            return s.date if s else None
        elif type_prefix == 'eks':
            s = energy_knot_session_service.get_session(item_id)
            return s.date if s else None
    except Exception:
        return None
    return None


def _get_expected_activity_keys(customer_id: str) -> list[str]:
    """根据当前活动、参与身份和到店记录生成唯一的应扣卡流水键。"""
    from app.services import (
        class_record_service,
        emotional_release_session_service,
        group_case_session_service,
        visit_service,
    )

    arrived_dates = {
        visit.visit_date
        for visit in visit_service._visits.values()
        if (
            visit.customer_id == customer_id
            and visit.arrived
            and not visit.is_deleted
        )
    }
    if not arrived_dates:
        return []

    expected: list[tuple[str, str, str]] = []

    def append_activity(prefix: str, activity) -> None:
        base_key = f"{prefix}:{activity.id}"
        created_at = activity.created_at.isoformat() if activity.created_at else ""
        count = get_activity_deduction_count(activity)
        for unit_index in range(1, count + 1):
            expected.append((
                activity.date,
                created_at,
                _activity_unit_key(base_key, unit_index),
            ))

    for record in class_record_service.list_records():
        if (
            record.date in arrived_dates
            and not record.is_public_welfare
            and customer_id in class_record_service._get_group_member_ids(record)
        ):
            append_activity("class", record)

    session_services = (
        ("gcs", group_case_session_service),
        ("ers", emotional_release_session_service),
    )
    for prefix, service in session_services:
        for session in service.list_sessions():
            if (
                session.date in arrived_dates
                and customer_id in service._get_chargeable_ids(session)
            ):
                append_activity(prefix, session)

    expected.sort(key=lambda item: item)
    return [activity_key for _, _, activity_key in expected]


def _tracking_matches_expected(customer_id: str, expected_keys: list[str]) -> bool:
    """检查每个应扣卡单位是否恰好存在一条卡流水或预支流水。"""
    tracked_keys = []
    for item in _deductions.get(customer_id, []):
        key = item.get("key") if isinstance(item, dict) else item
        if isinstance(key, str):
            tracked_keys.append(key)
    tracked_keys.extend(
        key
        for key in _debt_activities.get(customer_id, [])
        if isinstance(key, str)
    )
    return (
        len(tracked_keys) == len(set(tracked_keys))
        and set(tracked_keys) == set(expected_keys)
    )


def _rebuild_activity_tracking(
    customer_id: str,
    expected_keys: list[str],
) -> None:
    """以当前业务数据为准重建活动权益流水，清除重复及失效预支。"""
    _deductions.pop(customer_id, None)
    _debt_activities.pop(customer_id, None)
    _debts.pop(customer_id, None)
    for activity_key in expected_keys:
        _do_deduct(customer_id, activity_key)


def get_effective_remaining(customer_id: str) -> Optional[int]:
    """唯一真理：有效剩余 = 总购买 - 销卡 - 活动扣卡

    权益顺序：先使用会员卡；会员卡没有可用次数时，才由内部课程权益覆盖。
    返回 None 表示当前由不限次会员卡或内部课程权益覆盖。
    没有可用权益的活动会登记为欠卡，剩余次数允许为负数。
    不再读 card.remaining_count 作为依据，仅用流水相减。
    """
    reconcile_customer_card_usage(customer_id)
    from app.services import internal_course_service
    today = datetime.now().strftime("%Y-%m-%d")
    active = _active_cards(customer_id, today)
    all_cards = [c for c in list_cards() if c.customer_id == customer_id]
    if not all_cards:
        if internal_course_service.has_active_course(customer_id):
            return None
        manual = get_manual_deductions(customer_id)
        activity = get_activity_deductions(customer_id)
        return 0 - manual - activity - get_debt(customer_id)
    if any(c.remaining_count is None for c in active):
        return None
    total = get_grand_total(customer_id)
    manual = get_manual_deductions(customer_id)
    activity = get_activity_deductions(customer_id)
    remaining = total - manual - activity - get_debt(customer_id)
    if remaining > 0:
        return remaining
    if internal_course_service.has_active_course(customer_id):
        return None
    return remaining


_load()


def _calc_expiry(effective_date: str, duration_type: Optional[str], duration_value: Optional[int]) -> Optional[str]:
    """根据生效日期和时长自动计算到期日期。

    语义：到期日是生效日 + 时长 - 1 天，即该日为最后一天可用，次日失效。
    时长 1 天：5/1 生效，5/1 到期（5/2 失效）。1 个月：5/1 生效，5/31 到期（6/1 失效）。
    """
    if not duration_type or not duration_value:
        return None
    try:
        start = datetime.strptime(effective_date, "%Y-%m-%d")
    except ValueError:
        return None
    if duration_type == "day":
        end = start + timedelta(days=duration_value - 1)
    elif duration_type == "month":
        end = start + relativedelta(months=duration_value) - timedelta(days=1)
    else:
        return None
    return end.strftime("%Y-%m-%d")


def list_cards() -> List[MembershipCard]:
    return [v for v in _cards.values() if not v.is_deleted]


def get_card(card_id: str) -> Optional[MembershipCard]:
    card = _cards.get(card_id)
    if card and card.is_deleted:
        return None
    return card


def create_card(data: MembershipCardCreate) -> MembershipCard:
    with _card_lock:
        now = datetime.now(timezone.utc)
        card_data = data.model_dump()
        # 如果未传 total_count，默认等于 remaining_count
        if card_data.get("total_count") is None and card_data.get("remaining_count") is not None:
            card_data["total_count"] = card_data["remaining_count"]
        # 自动计算到期日期
        card_data["expiry_date"] = _calc_expiry(
            card_data["effective_date"],
            card_data.get("duration_type"),
            card_data.get("duration_value"),
        )
        card = MembershipCard(
            id=str(uuid.uuid4())[:12],
            created_at=now,
            updated_at=now,
            **card_data,
        )
        _cards[card.id] = card
        _save(card.id)
        customer_id = card.customer_id
        # 后补会员卡时，按活动日期把内部课程抵扣/欠费记录回填到有效期覆盖的会员卡。
        reconcile_customer_card_usage(customer_id)
    _refresh_member_type(customer_id)
    return card


def update_card(card_id: str, data: dict) -> Optional[MembershipCard]:
    with _card_lock:
        card = _cards.get(card_id)
        if not card or card.voided:
            return None
        for key, value in data.items():
            if hasattr(card, key) and key not in ("id", "created_at", "created_by"):
                setattr(card, key, value)
        # 重新计算到期日期
        card.expiry_date = _calc_expiry(
            card.effective_date,
            card.duration_type,
            card.duration_value,
        )
        card.updated_at = datetime.now(timezone.utc)
        _cards[card_id] = card
        _save(card_id)
    reconcile_customer_card_usage(card.customer_id)
    _refresh_member_type(card.customer_id)
    return card


def delete_card(card_id: str) -> bool:
    with _card_lock:
        card = _cards.get(card_id)
        if not card:
            return False
        customer_id = card.customer_id
        card.is_deleted = True
        card.deleted_at = datetime.now(timezone.utc)
        _save(card_id)
    _refresh_member_type(customer_id)
    return True


def _select_membership_benefit(customer_id: str, usage_date: str) -> Optional[tuple]:
    """按活动日期选择可用会员卡权益；没有可用会员卡时返回 None。"""
    active_cards = _active_cards(customer_id, usage_date)
    unlimited_cards = [card for card in active_cards if card.remaining_count is None]
    if unlimited_cards:
        unlimited_cards.sort(
            key=lambda card: (
                card.expiry_date or "9999-12-31",
                card.effective_date or "9999-12-31",
                card.created_at or "",
                card.id,
            )
        )
        selected = unlimited_cards[0]
        return (
            selected.id,
            "unlimited_card",
            selected.id,
            selected.card_type,
        )

    countable = [card for card in active_cards if card.remaining_count is not None]
    selected = _pick_earliest_expiry_card(countable, customer_id)
    if selected:
        from app.services import project_deduction_service

        manual = project_deduction_service.get_deduction_total_for_project(selected.id)
        activity = _get_card_activity_deductions_count(selected.id)
        if (selected.total_count or 0) - manual - activity > 0:
            return (
                selected.id,
                "count_card",
                selected.id,
                selected.card_type,
            )
    return None


def _deduct_one(customer_id: str, usage_date: Optional[str] = None) -> tuple:
    """内部：为指定用户扣除一次会员活动剩余次数。

    返回 (success, card_id, benefit_type, benefit_id, benefit_name)：
      success=True — 已匹配到次数卡、不限次卡或内部课程权益
      success=False — 无法匹配有效权益，进入欠费或等待未生效卡
    新逻辑：不修改 card.remaining_count 字段，扣减由调用方记流水实现（见 deduct_for_activity）。
    """
    target_date = usage_date or datetime.now().strftime("%Y-%m-%d")
    from app.services import internal_course_service

    # 第一优先级：会员卡（次数卡或不限次卡）。
    card_benefit = _select_membership_benefit(customer_id, target_date)
    if card_benefit:
        card_id, benefit_type, benefit_id, benefit_name = card_benefit
        return (True, card_id, benefit_type, benefit_id, benefit_name)

    # 第二优先级：活动当天有效的内部课程权益。
    active_course = internal_course_service.get_active_course(customer_id, target_date)
    if active_course:
        return (
            True,
            None,
            "internal_course",
            active_course.id,
            active_course.course_type,
        )

    # 最后才进入欠费，后续补卡时可按活动日期自动回填。
    _debts[customer_id] = _debts.get(customer_id, 0) + 1
    return (False, None, "", "", "")


def _pick_earliest_expiry_card(countable_cards, customer_id: str):
    """从可扣次数卡中选出优先级最高的一张。

    排序规则（用户明确要求）：先生效的先扣，同日生效按到期日最早的优先。
    规则：
      1. 排除该卡在该用户已被记扣费次数 ≥ total_count 的卡（即该卡按流水已扣完）
      2. 余下按 effective_date 升序；无 effective_date 视为永久，排最后
      3. 同日生效按 expiry_date 升序；无 expiry_date 视为永久，排最后
    """
    from app.services import project_deduction_service
    if not countable_cards:
        return None
    def remaining_after_water(card):
        manual = project_deduction_service.get_deduction_total_for_project(card.id)
        activity = _get_card_activity_deductions_count(card.id)
        return (card.total_count or 0) - manual - activity
    def sort_key(c):
        # 优先：生效日期最早；无生效日期视为永久，排最后
        # 其次：到期日最早；无到期日视为永久，排最后
        return (c.effective_date or "9999-12-31", c.expiry_date or "9999-12-31", c.created_at or "", c.id)
    with_remaining = [(c, remaining_after_water(c)) for c in countable_cards]
    pool = [c for c, r in with_remaining if r > 0]
    if not pool:
        pool = list(countable_cards)
    pool.sort(key=sort_key)
    return pool[0] if pool else None


def _get_card_activity_deductions_count(card_id: str) -> int:
    """统计明确记录到该卡的活动使用次数。"""
    card = _cards.get(card_id)
    if not card:
        return 0
    return sum(
        1
        for item in _deductions.get(card.customer_id, [])
        if isinstance(item, dict) and item.get("card_id") == card_id
    )


def _set_record_benefit(record: dict, benefit: tuple) -> None:
    """将活动使用记录改记到指定会员卡权益。"""
    card_id, benefit_type, benefit_id, benefit_name = benefit
    remaining_after = None
    if benefit_type == "count_card" and card_id:
        current_remaining = get_card_effective_remaining(card_id)
        if current_remaining is not None:
            remaining_after = max(0, current_remaining - 1)
    record.update({
        "card_id": card_id,
        "benefit_type": benefit_type,
        "benefit_id": benefit_id,
        "benefit_name": benefit_name,
        "remaining_after": remaining_after,
    })


def _set_record_internal_course(record: dict, course) -> None:
    """将活动使用记录改记到内部课程权益。"""
    record.update({
        "card_id": None,
        "benefit_type": "internal_course",
        "benefit_id": course.id,
        "benefit_name": course.course_type,
        "remaining_after": None,
    })


def _rebuild_card_remaining_snapshots(card: MembershipCard) -> bool:
    """按真实扣卡顺序重建该卡每条流水扣减后的余额快照。"""
    from app.services import project_deduction_service

    if card.remaining_count is None:
        return False

    events = []
    for deduction in project_deduction_service._deductions.values():
        if (
            deduction.project_id == card.id
            and deduction.project_type == "membership-cards"
            and not deduction.is_deleted
        ):
            created_at = deduction.created_at.isoformat() if deduction.created_at else ""
            events.append((
                deduction.deduction_date or created_at[:10],
                created_at,
                deduction.id,
                deduction.count,
                "manual",
                deduction,
            ))

    for record in _deductions.get(card.customer_id, []):
        if not isinstance(record, dict) or record.get("card_id") != card.id:
            continue
        activity_key = record.get("key", "")
        activity_date = _get_activity_date(activity_key)
        if not activity_date:
            continue
        deducted_at = record.get("deducted_at") or f"{activity_date}T23:59:59"
        events.append((
            activity_date,
            deducted_at,
            activity_key,
            1,
            "activity",
            record,
        ))

    changed = False
    remaining = card.total_count or 0
    changed_manual_records = []
    for _, _, _, count, event_type, event in sorted(events, key=lambda item: item[:3]):
        remaining = max(0, remaining - count)
        previous_remaining = event.remaining_after if event_type == "manual" else event.get("remaining_after")
        if previous_remaining != remaining:
            if event_type == "manual":
                event.remaining_after = remaining
                changed_manual_records.append(event)
            else:
                event["remaining_after"] = remaining
            changed = True

    for deduction in changed_manual_records:
        project_deduction_service._save(deduction.id)
    return changed


def reconcile_customer_card_usage(customer_id: str) -> bool:
    """按活动日期重排客户权益使用记录。

    会员卡始终优先；卡的有效期不覆盖活动时，才回退到活动当天有效的内部课程权益。
    后补会员卡后，本函数会把原内部课程抵扣和欠费记录转回会员卡，直到卡次数用完。
    """
    from app.services import internal_course_service

    changed = False
    expected_keys = _get_expected_activity_keys(customer_id)
    if not _tracking_matches_expected(customer_id, expected_keys):
        _rebuild_activity_tracking(customer_id, expected_keys)
        changed = True

    records = _deductions.get(customer_id, [])
    candidates: list[tuple[str, dict]] = []

    for record in records:
        if not isinstance(record, dict):
            continue
        activity_key = record.get("key")
        if not isinstance(activity_key, str) or activity_key.startswith("ics:"):
            continue
        usage_date = _get_activity_date(activity_key)
        if not usage_date:
            continue

        benefit_type = record.get("benefit_type")
        card_id = record.get("card_id")
        card = _cards.get(card_id) if card_id else None
        card_covers_date = bool(
            card
            and not card.is_deleted
            and not card.voided
            and (not card.effective_date or card.effective_date <= usage_date)
            and (not card.expiry_date or card.expiry_date >= usage_date)
        )
        if benefit_type == "internal_course" or (card_id and not card_covers_date):
            candidates.append((usage_date, record))

    newly_uncovered_keys = []
    for usage_date, record in sorted(candidates, key=lambda item: (item[0], item[1].get("key", ""))):
        previous = (
            record.get("card_id"),
            record.get("benefit_type"),
            record.get("benefit_id"),
            record.get("benefit_name"),
        )
        # 先清空当前归属，避免它占用原卡容量后影响重新选择。
        record.update({
            "card_id": None,
            "benefit_type": "",
            "benefit_id": "",
            "benefit_name": "",
            "remaining_after": None,
        })
        card_benefit = _select_membership_benefit(customer_id, usage_date)
        if card_benefit:
            _set_record_benefit(record, card_benefit)
        else:
            course = internal_course_service.get_active_course(customer_id, usage_date)
            if course:
                _set_record_internal_course(record, course)
            else:
                records.remove(record)
                newly_uncovered_keys.append(record["key"])
        current = (
            record.get("card_id"),
            record.get("benefit_type"),
            record.get("benefit_id"),
            record.get("benefit_name"),
        )
        changed = changed or current != previous

    debt_keys = list(_debt_activities.get(customer_id, []))
    for activity_key in newly_uncovered_keys:
        if activity_key not in debt_keys:
            debt_keys.append(activity_key)
    remaining_debts = []
    for activity_key in sorted(debt_keys, key=lambda key: (_get_activity_date(key) or "9999-12-31", key)):
        usage_date = _get_activity_date(activity_key)
        if not usage_date:
            remaining_debts.append(activity_key)
            continue
        record = {
            "key": activity_key,
            "card_id": None,
            "benefit_type": "",
            "benefit_id": "",
            "benefit_name": "",
            "remaining_after": None,
            "deducted_at": None,
        }
        card_benefit = _select_membership_benefit(customer_id, usage_date)
        if card_benefit:
            _set_record_benefit(record, card_benefit)
        else:
            course = internal_course_service.get_active_course(customer_id, usage_date)
            if course:
                _set_record_internal_course(record, course)
            else:
                remaining_debts.append(activity_key)
                continue
        _deductions.setdefault(customer_id, []).append(record)
        changed = True

    # 人工销卡与活动扣卡统一按发生时间重建，确保每条都是该次扣减后的快照。
    for card in (card for card in list_cards() if card.customer_id == customer_id):
        changed = _rebuild_card_remaining_snapshots(card) or changed

    previous_debt_keys = _debt_activities.get(customer_id, [])
    previous_debt_count = _debts.get(customer_id, 0)
    if remaining_debts:
        _debt_activities[customer_id] = remaining_debts
        _debts[customer_id] = len(remaining_debts)
    else:
        if customer_id in _debt_activities or customer_id in _debts:
            changed = True
        _debt_activities.pop(customer_id, None)
        _debts.pop(customer_id, None)

    changed = changed or remaining_debts != previous_debt_keys or len(remaining_debts) != previous_debt_count
    if changed:
        _save_deductions()
        _save_debts()
    return changed


def _restore_one(customer_id: str, card_id: Optional[str] = None) -> bool:
    """内部：为指定用户返还一次会员活动剩余次数。

    新逻辑：不修改 card.remaining_count；返还的本质由调用方从 _deductions/_debt_activities 里移除记录实现。
    card_id 仅用于未来扩展（如需精确退回到具体卡），当前不实际改变字段。
    """
    return True


def can_deduct(customer_id: str, activity_key: str) -> bool:
    """检查指定用户是否可以扣费（不实际扣减）"""
    if _is_activity_already_deducted(customer_id, activity_key):
        return True  # 已扣过
    effective = get_effective_remaining(customer_id)
    if effective is None:
        return True  # 不限次
    return effective > 0


def _is_activity_already_deducted(customer_id: str, activity_key: str) -> bool:
    for item in _deductions.get(customer_id, []):
        key = item.get("key") if isinstance(item, dict) else item
        if key == activity_key:
            return True
    return activity_key in _debt_activities.get(customer_id, [])


def _do_deduct(customer_id: str, activity_key: str) -> bool:
    """内部扣费逻辑（不加锁、不保存），供 deduct_for_activity 和 _deduct_for_record 调用"""
    if activity_key.startswith("ics:"):
        return True
    if _is_activity_already_deducted(customer_id, activity_key):
        return True  # 已扣过，跳过
    usage_date = _get_activity_date(activity_key)
    success, card_id, benefit_type, benefit_id, benefit_name = _deduct_one(customer_id, usage_date)
    if success:
        record = {
            "key": activity_key,
            "card_id": card_id,
            "benefit_type": benefit_type,
            "benefit_id": benefit_id,
            "benefit_name": benefit_name,
            "remaining_after": None,
            "deducted_at": datetime.now(timezone.utc).isoformat(),
        }
        if benefit_type == "count_card" and card_id:
            current_remaining = get_card_effective_remaining(card_id)
            if current_remaining is not None:
                record["remaining_after"] = max(0, current_remaining - 1)
        _deductions.setdefault(customer_id, []).append(record)
    else:
        _debt_activities.setdefault(customer_id, []).append(activity_key)
    return success


def _do_restore(customer_id: str, activity_key: str) -> bool:
    """内部退费逻辑（不加锁、不保存），供 restore_for_activity 和 _restore_for_record 调用"""
    removed = False
    records = _deductions.get(customer_id, [])
    kept_records = []
    for item in records:
        key = item.get("key") if isinstance(item, dict) else item
        if key == activity_key:
            card_id = item.get("card_id") if isinstance(item, dict) else None
            _restore_one(customer_id, card_id)
            removed = True
        else:
            kept_records.append(item)
    if kept_records:
        _deductions[customer_id] = kept_records
    else:
        _deductions.pop(customer_id, None)

    debt_keys = _debt_activities.get(customer_id, [])
    kept_debt_keys = [key for key in debt_keys if key != activity_key]
    if len(kept_debt_keys) != len(debt_keys):
        removed = True
    if kept_debt_keys:
        _debt_activities[customer_id] = kept_debt_keys
        _debts[customer_id] = len(kept_debt_keys)
    else:
        _debt_activities.pop(customer_id, None)
        _debts.pop(customer_id, None)
    return removed


def _do_sync_activity_count(customer_id: str, activity_key: str, desired_count: int) -> None:
    """将某客户在某活动的扣卡/欠费单位同步到指定次数（不加锁、不保存）。"""
    desired_count = max(0, int(desired_count or 0))
    base_key = _base_activity_key(activity_key)
    existing_keys: set[str] = set()
    for item in _deductions.get(customer_id, []):
        key = item.get("key") if isinstance(item, dict) else item
        if isinstance(key, str) and _base_activity_key(key) == base_key:
            existing_keys.add(key)
    for key in _debt_activities.get(customer_id, []):
        if isinstance(key, str) and _base_activity_key(key) == base_key:
            existing_keys.add(key)

    desired_keys = {
        _activity_unit_key(base_key, unit_index)
        for unit_index in range(1, desired_count + 1)
    }
    for key in sorted(existing_keys - desired_keys, key=_activity_unit_index, reverse=True):
        _do_restore(customer_id, key)
    for unit_index in range(1, desired_count + 1):
        key = _activity_unit_key(base_key, unit_index)
        if key not in existing_keys:
            _do_deduct(customer_id, key)


def deduct_for_activity(customer_id: str, activity_key: str) -> bool:
    """为指定用户在指定活动中扣费（同一活动同一人只扣一次）"""
    with _deduct_lock:
        success = _do_deduct(customer_id, activity_key)
        _save_deductions()
        _save_debts()
        return success


def restore_for_activity(customer_id: str, activity_key: str) -> bool:
    """返还指定用户在指定活动中的扣费"""
    with _deduct_lock:
        success = _do_restore(customer_id, activity_key)
        _save_deductions()
        _save_debts()
        return success


def _refresh_member_type(customer_id: str):
    """委托给 member_identity_service 计算身份"""
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(customer_id)


def _activity_key_label(activity_key: str) -> str:
    """将活动 key 转为可读标签，优先显示活动名称，无名称则显示类型"""
    type_map = {"class": "课程", "gcs": "觉醒游戏", "ers": "情绪释放"}
    prefix = activity_key.split(":")[0] if ":" in activity_key else ""
    type_name = type_map.get(prefix, prefix)
    activity_id = activity_key.split(":", 1)[1] if ":" in activity_key else activity_key
    name = ""
    try:
        if prefix == "class":
            from app.services import class_record_service
            r = class_record_service.get_record(activity_id)
            if r:
                name = r.activity_name or r.course_name or ""
        elif prefix == "gcs":
            from app.services import group_case_session_service
            s = group_case_session_service.get_session(activity_id)
            if s:
                name = s.name or ""
        elif prefix == "ers":
            from app.services import emotional_release_session_service
            s = emotional_release_session_service.get_session(activity_id)
            if s:
                name = s.name or ""
    except Exception:
        pass
    label = name or type_name
    date = _get_activity_date(activity_key)
    if date:
        return f"{label} {date}"
    return label


def get_debt_record(customer_id: str) -> dict:
    """返回单个客户的会员卡欠卡汇总，并按活动聚合多次扣卡。"""
    activity_keys = _debt_activities.get(customer_id, [])
    grouped: dict[str, int] = {}
    for activity_key in activity_keys:
        base_key = _base_activity_key(activity_key)
        grouped[base_key] = grouped.get(base_key, 0) + 1

    activities = []
    for activity_key, count in grouped.items():
        activity_date = _get_activity_date(activity_key) or ""
        full_label = _activity_key_label(activity_key)
        label = full_label.removesuffix(f" {activity_date}") if activity_date else full_label
        activities.append({
            "label": label,
            "date": activity_date,
            "count": count,
        })
    debt = sum(item["count"] for item in activities)
    customer = customer_service.get_customer(customer_id)
    return {
        "customer_id": customer_id,
        "nickname": customer.nickname if customer else "",
        "member_type": customer.member_type if customer else "",
        "total_count": get_grand_total(customer_id),
        "deducted_count": get_manual_deductions(customer_id) + get_activity_deductions(customer_id) + debt,
        "debt_count": debt,
        "debt_activities": activities,
        "activity_labels": [
            f"{item['label']} {item['date']}×{item['count']}" if item["count"] > 1
            else f"{item['label']} {item['date']}".strip()
            for item in activities
        ],
    }


def list_debt_records() -> list:
    """列出所有欠卡记录（会员卡），返回 [{customer_id, nickname, member_type, total_count, deducted_count, debt_count, activity_labels}]"""
    result = []
    for customer_id, activity_keys in _debt_activities.items():
        if not activity_keys:
            continue
        result.append(get_debt_record(customer_id))
    result.sort(key=lambda r: r["nickname"])
    return result


def search_customers(keyword: str) -> list:
    if not keyword:
        return []
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
            })
    return results
