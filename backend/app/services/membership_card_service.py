import uuid
import threading
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Optional, Dict

from app.models.membership_card import MembershipCard, MembershipCardCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

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


def _migrate_closers(item: MembershipCard) -> MembershipCard:
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]
    return item


def _migrate_total_count(item: MembershipCard) -> MembershipCard:
    if item.total_count is None and item.remaining_count is not None:
        item.total_count = item.remaining_count
    return item


def _migrate_deductions(raw):
    """兼容老数据：把 _deductions 元素统一为 {key, card_id}"""
    out: Dict[str, list] = {}
    for customer_id, items in (raw or {}).items():
        migrated = []
        for it in items:
            if isinstance(it, dict):
                migrated.append({"key": it.get("key"), "card_id": it.get("card_id")})
            else:
                migrated.append({"key": it, "card_id": None})
        out[customer_id] = migrated
    return out


def _load():
    global _cards, _deductions, _debts, _debt_activities
    data = load_data(FILENAME)
    _cards = {}
    for k, v in data.items():
        _cards[k] = _migrate_total_count(_migrate_closers(MembershipCard(**v)))
    _deductions = _migrate_deductions(load_data(DEDUCTIONS_FILE))
    _debts = load_data(DEBTS_FILE) or {}
    _debt_activities = load_data(DEBT_ACTIVITIES_FILE) or {}


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
        visit_service,
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        oh_card_reading_session_service,
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
    for s in energy_knot_session_service.list_sessions():
        if not s.is_deleted and s.date in arrived_dates:
            chargeable = set(s.participant_ids)
            chargeable.discard(s.owner_id)
            if customer_id in chargeable:
                count += 1
    for s in oh_card_reading_session_service.list_sessions():
        if not s.is_deleted and s.date in arrived_dates:
            chargeable = set(s.participant_ids)
            chargeable.discard(s.owner_id)
            if customer_id in chargeable:
                count += 1
    return count


def get_activity_deductions(customer_id: str) -> int:
    """活动扣卡次数（仅计算实际从卡扣除的，不含不限次和内部课程覆盖的）"""
    today = datetime.now().strftime("%Y-%m-%d")
    active = _active_cards(customer_id, today)
    if any(c.remaining_count is None for c in active):
        return 0  # 有不限次卡，活动走不限次通道
    count = _count_raw_activities(customer_id)
    if count <= 0:
        return 0
    from app.services import internal_course_service
    if internal_course_service.has_active_course(customer_id):
        grand_total = get_grand_total(customer_id)
        manual = get_manual_deductions(customer_id)
        card_available = max(0, grand_total - manual)
        return min(count, card_available)
    return count


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


def _get_activity_date(activity_key: str) -> Optional[str]:
    """根据 activity_key（如 class:xxx, gcs:xxx）查找活动日期"""
    from app.services import (
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        oh_card_reading_session_service,
    )
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
        elif type_prefix == 'ocr':
            s = oh_card_reading_session_service.get_session(item_id)
            return s.date if s else None
    except Exception:
        return None
    return None


def get_effective_remaining(customer_id: str) -> Optional[int]:
    """唯一真理：有效剩余 = 总购买 - 销卡 - 活动扣卡

    返回 None 表示不限次。触发不限次的两种情况：
    1. 有任一不限次卡在有效期内
    2. 在内部课程有效期（疗愈师课程等已购课程生效区间）

    其余情况按 total - manual - activity 计算（可为负数，表示欠费）。
    不再读 card.remaining_count 作为依据，仅用流水相减。
    """
    from app.services import internal_course_service
    today = datetime.now().strftime("%Y-%m-%d")
    active = _active_cards(customer_id, today)
    all_cards = [c for c in list_cards() if c.customer_id == customer_id]
    if not all_cards:
        # 无会员卡：若在内部课程有效期，视为不限次；否则按流水算欠费（负数）
        if internal_course_service.has_active_course(customer_id):
            return None
        manual = get_manual_deductions(customer_id)
        activity = get_activity_deductions(customer_id)
        return 0 - manual - activity
    # 有不限次卡在有效期内 → 不限次
    if any(c.remaining_count is None for c in active):
        return None
    # 在内部课程有效期 → 不限次（即使会员卡次数已扣完，也不显示负数）
    if internal_course_service.has_active_course(customer_id):
        return None
    total = get_grand_total(customer_id)
    manual = get_manual_deductions(customer_id)
    activity = get_activity_deductions(customer_id)
    return total - manual - activity


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
        # 购买新卡后，把之前的欠费活动补登记为已扣费（移到 _deductions 流水，不动 card.remaining_count）
        customer_id = card.customer_id
        debt_acts = list(_debt_activities.get(customer_id, []))
        debt_count = _debts.get(customer_id, 0)
        tracked_count = min(debt_count, len(debt_acts))
        if tracked_count > 0 and card.remaining_count is not None:
            to_settle = debt_acts[:tracked_count]
            _deductions.setdefault(customer_id, []).extend(to_settle)
            remaining_acts = debt_acts[tracked_count:]
            if remaining_acts:
                _debt_activities[customer_id] = remaining_acts
            else:
                _debt_activities.pop(customer_id, None)
            new_debt = debt_count - tracked_count
            if new_debt > 0:
                _debts[customer_id] = new_debt
            else:
                _debts.pop(customer_id, None)
            _save_deductions()
            _save_debts()
        elif tracked_count > 0 and card.remaining_count is None:
            # 不限次卡：直接清除所有欠费记录（不限次卡覆盖所有历史使用）
            _debt_activities.pop(customer_id, None)
            _debts.pop(customer_id, None)
            _save_debts()
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


def _deduct_one(customer_id: str) -> tuple:
    """内部：为指定用户扣除一次会员活动剩余次数。

    返回 (success, card_id)：
      success=True, card_id=xxx — 扣到具体卡，card_id 用于 _deductions 追溯
      success=True, card_id=None — 不限次卡或内部课程期，不消耗任何卡次数
      success=False, card_id=None — 无法扣（欠费/无卡/未生效卡）
    新逻辑：不修改 card.remaining_count 字段，扣减由调用方记流水实现（见 deduct_for_activity）。
    """
    today = datetime.now().strftime("%Y-%m-%d")
    active_cards = _active_cards(customer_id, today)
    if not active_cards:
        pending_cards = [
            c for c in list_cards()
            if c.customer_id == customer_id and c.effective_date and c.effective_date > today
        ]
        if pending_cards:
            return (False, None)  # 有未生效的卡，不记录欠费，等生效后再扣
        from app.services import internal_course_service
        if internal_course_service.has_active_course(customer_id):
            return (False, None)
        _debts[customer_id] = _debts.get(customer_id, 0) + 1
        _save_debts()
        return (False, None)
    # 不限次卡：直接放行，不消耗具体卡
    if any(c.remaining_count is None for c in active_cards):
        return (True, None)
    effective = get_effective_remaining(customer_id)
    if effective is None:
        return (True, None)
    if effective <= 0:
        from app.services import internal_course_service
        if internal_course_service.has_active_course(customer_id):
            return (False, None)
        _debts[customer_id] = _debts.get(customer_id, 0) + 1
        _save_debts()
        return (False, None)
    # 有剩余：按到期日最早优先扣那张次数卡
    countable = [c for c in active_cards if c.remaining_count is not None]
    selected = _pick_earliest_expiry_card(countable, customer_id)
    return (True, selected.id if selected else None)


def _pick_earliest_expiry_card(countable_cards, customer_id: str):
    """从可扣次数卡中选出"剩余时间最短"的一张——即到期日最近。

    规则：
      1. 排除该卡在该用户已被记扣费次数 ≥ total_count 的卡（即该卡按流水已扣完）
      2. 余下按 expiry_date 升序；无 expiry_date 视为永久，排最后
    """
    from app.services import project_deduction_service
    if not countable_cards:
        return None
    def remaining_after_water(card):
        # 该卡已扣次数 = 该卡的销卡流水（按 project_id=card.id）+ 该卡有 card_id 的活动扣卡流水
        manual = project_deduction_service.get_deduction_total_for_project(card.id)
        activity = _get_card_activity_deductions_count(card.id)
        return (card.total_count or 0) - manual - activity
    def sort_key(c):
        # 优先：到期日最早（"剩余时间最短"）；永久卡无 expiry 排到最后
        # 永久卡之间：按创建时间最早的优先扣
        return (c.expiry_date or "9999-12-31", c.created_at or "", c.id)
    with_remaining = [(c, remaining_after_water(c)) for c in countable_cards]
    pool = [c for c, r in with_remaining if r > 0]
    if not pool:
        # 全部已扣完，但聚合 effective>0 说明 activity_deductions 历史未分卡；取最早到期那张兜底
        pool = list(countable_cards)
    pool.sort(key=sort_key)
    return pool[0] if pool else None


def _get_card_activity_deductions_count(card_id: str) -> int:
    """统计该卡的活动扣卡次数（按实际活动参与 + 最早到期优先分配，不依赖 _deductions 流水表）"""
    from app.services import project_deduction_service
    card = _cards.get(card_id)
    if not card:
        return 0
    customer_id = card.customer_id
    # 有不限次卡时，活动走不限次通道，次数卡不扣
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    active = _active_cards(customer_id, today)
    if any(c.remaining_count is None for c in active):
        return 0
    total_activities = get_activity_deductions(customer_id)
    if total_activities <= 0:
        return 0
    # 按到期日最早优先分配到各卡
    countable = [c for c in list_cards()
                 if c.customer_id == customer_id and c.remaining_count is not None and not c.voided
                 and (not c.effective_date or c.effective_date <= today)]
    countable.sort(key=lambda c: (c.expiry_date or "9999-12-31", c.created_at or "", c.id))
    remaining_activities = total_activities
    for c in countable:
        manual = project_deduction_service.get_deduction_total_for_project(c.id)
        available = (c.total_count or 0) - manual
        allocated = min(remaining_activities, max(0, available))
        if c.id == card_id:
            return allocated
        remaining_activities -= allocated
    return 0


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
    if customer_id not in _deductions:
        return False
    for item in _deductions[customer_id]:
        key = item.get("key") if isinstance(item, dict) else item
        if key == activity_key:
            return True
    return False


def _do_deduct(customer_id: str, activity_key: str) -> bool:
    """内部扣费逻辑（不加锁、不保存），供 deduct_for_activity 和 _deduct_for_record 调用"""
    if _is_activity_already_deducted(customer_id, activity_key):
        return True  # 已扣过，跳过
    success, card_id = _deduct_one(customer_id)
    if success:
        _deductions.setdefault(customer_id, []).append({"key": activity_key, "card_id": card_id})
    elif not success:
        from app.services import internal_course_service
        if internal_course_service.has_active_course(customer_id):
            return True  # 卡扣完了，内部课程覆盖，不记欠费
        _debt_activities.setdefault(customer_id, []).append(activity_key)
    return success


def _do_restore(customer_id: str, activity_key: str) -> bool:
    """内部退费逻辑（不加锁、不保存），供 restore_for_activity 和 _restore_for_record 调用"""
    if customer_id in _deductions:
        target_idx = None
        target_card_id = None
        for i, item in enumerate(_deductions[customer_id]):
            key = item.get("key") if isinstance(item, dict) else item
            if key == activity_key:
                target_idx = i
                target_card_id = item.get("card_id") if isinstance(item, dict) else None
                break
        if target_idx is not None:
            _restore_one(customer_id, target_card_id)
            _deductions[customer_id].pop(target_idx)
            if not _deductions[customer_id]:
                del _deductions[customer_id]
            return True
    if customer_id in _debt_activities and activity_key in _debt_activities[customer_id]:
        _debt_activities[customer_id].remove(activity_key)
        if not _debt_activities[customer_id]:
            del _debt_activities[customer_id]
        if customer_id in _debts and _debts[customer_id] > 0:
            _debts[customer_id] -= 1
            if _debts[customer_id] <= 0:
                del _debts[customer_id]
        return True
    return False


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
