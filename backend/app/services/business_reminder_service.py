import threading
from datetime import datetime, timezone, date
from typing import List, Dict, Any, Optional

from app.services.storage import load_data, save_data, save_item
from app.services import reminder_service, customer_service, visit_service, membership_card_service

STATUS_FILE = "business_reminder_statuses.json"
_statuses: Dict[str, Dict[str, Any]] = {}

CACHE_FILE = "business_reminder_eval_cache.json"
_eval_cache: Dict[str, Any] = {}  # loaded from file, keyed by (user_id, user_role)
_cache_lock = threading.Lock()

# 数据文件列表，任一变更则缓存失效
_DATA_FILES = [
    "reminders.json", "customers.json", "visits.json",
    "class_records.json", "group_case_sessions.json",
    "emotional_release_sessions.json", "energy_knot_sessions.json",
    "internal_course_sessions.json", "membership_cards.json",
]


def _load():
    global _statuses, _eval_cache
    _statuses = load_data(STATUS_FILE) or {}
    _eval_cache = load_data(CACHE_FILE) or {}


def _save(item_id: str = ""):
    if item_id:
        item = _statuses.get(item_id)
        if item:
            save_item(STATUS_FILE, item_id, item)
    else:
        save_data(STATUS_FILE, _statuses)


def _save_eval_cache():
    save_data(CACHE_FILE, _eval_cache)


_load()


def _get_data_version():
    """返回数据文件的修改时间戳，用于缓存失效检测"""
    import os
    data_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data")
    try:
        return max(os.path.getmtime(os.path.join(data_dir, f)) for f in _DATA_FILES if os.path.exists(os.path.join(data_dir, f)))
    except Exception:
        return 0


def _compare(operator: str, actual: int, expected: int) -> bool:
    if operator == "gt":
        return actual > expected
    if operator == "eq":
        return actual == expected
    if operator == "lt":
        return actual < expected
    return False


def _evaluate_condition(condition, customer_id: str) -> bool:
    """评估单个条件是否匹配某客户"""
    today = date.today()

    if condition.type == "acquaintance_date":
        customer = customer_service.get_customer(customer_id)
        if not customer or not customer.created_at:
            return False
        created = customer.created_at.date() if isinstance(customer.created_at, datetime) else customer.created_at
        days = (today - created).days
        if condition.mode == "fixed_cycle":
            return condition.value > 0 and days > 0 and days % condition.value == 0
        if condition.mode == "relative":
            return _compare(condition.operator, days, condition.value)
        return False

    if condition.type == "visit_count":
        count = visit_service.count_customer_visits(customer_id)
        if condition.mode == "fixed_cycle":
            return condition.value > 0 and count > 0 and count % condition.value == 0
        return _compare(condition.operator, count, condition.value)

    if condition.type == "activity":
        if condition.mode == "participation_count":
            count = visit_service._count_customer_activities_by_type(customer_id, condition.activity_type)
            return _compare(condition.operator, count, condition.value)
        if condition.mode == "remaining_count":
            cards = [
                c for c in membership_card_service.list_cards()
                if c.customer_id == customer_id and c.remaining_count is not None
            ]
            if not cards:
                return False
            latest = max(cards, key=lambda c: c.created_at)
            remaining = latest.remaining_count if latest.remaining_count is not None else 0
            return _compare(condition.operator, remaining, condition.value)
        return False

    return False


def _format_condition(condition) -> str:
    """将条件格式化为可读文字"""
    op_map = {"gt": "大于", "eq": "等于", "lt": "小于"}
    activity_map = {
        "membership": "会员卡", "emotional_release": "情绪释放",
        "group_case": "觉醒游戏", "energy_knot": "能量结", "internal_course": "内部课程",
    }

    if condition.type == "acquaintance_date":
        if condition.mode == "fixed_cycle":
            return f"每{condition.value}天"
        op = op_map.get(condition.operator, condition.operator)
        return f"认识{op}{condition.value}天"

    if condition.type == "visit_count":
        if condition.mode == "fixed_cycle":
            return f"每{condition.value}次"
        op = op_map.get(condition.operator, condition.operator)
        return f"到店{op}{condition.value}次"

    if condition.type == "activity":
        act = activity_map.get(condition.activity_type, condition.activity_type)
        mode = "参与" if condition.mode == "participation_count" else "剩余"
        op = op_map.get(condition.operator, condition.operator)
        return f"{act}{mode}{op}{condition.value}次"

    return ""


def _precompute_metrics(customer_ids: set) -> Dict[str, Dict[str, Any]]:
    """批量预计算所有客户的指标，避免重复遍历"""
    from app.services import (
        visit_service,
        membership_card_service,
        class_record_service,
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    )

    metrics: Dict[str, Dict[str, Any]] = {cid: {} for cid in customer_ids}

    # 1. 到店次数 — 一次遍历所有 visits
    visit_counts: Dict[str, set] = {}
    for v in visit_service._visits.values():
        if v.customer_id in customer_ids and v.arrived:
            visit_counts.setdefault(v.customer_id, set()).add(v.visit_date)
    for cid in customer_ids:
        metrics[cid]["visit_count"] = len(visit_counts.get(cid, set()))

    # 2. 活动参与次数 — 遍历记录 → 累加匹配客户，O(records × avg_participants)
    activity_counts: Dict[str, Dict[str, int]] = {cid: {} for cid in customer_ids}

    for cr in class_record_service.list_records():
        for cid in cr.participant_ids:
            if cid in customer_ids:
                activity_counts[cid]["membership"] = activity_counts[cid].get("membership", 0) + 1

    for s in emotional_release_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
            if cid and cid in customer_ids:
                activity_counts[cid]["emotional_release"] = activity_counts[cid].get("emotional_release", 0) + 1

    for s in group_case_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
            if cid and cid in customer_ids:
                activity_counts[cid]["group_case"] = activity_counts[cid].get("group_case", 0) + 1

    for s in energy_knot_session_service.list_sessions():
        for cid in (s.participant_ids + [s.owner_id, s.host_id] + s.teacher_ids):
            if cid and cid in customer_ids:
                activity_counts[cid]["energy_knot"] = activity_counts[cid].get("energy_knot", 0) + 1

    for s in internal_course_session_service.list_sessions():
        for cid in (s.participant_ids + s.teacher_ids):
            if cid and cid in customer_ids:
                activity_counts[cid]["internal_course"] = activity_counts[cid].get("internal_course", 0) + 1

    for cid in customer_ids:
        metrics[cid]["activity_counts"] = activity_counts[cid]

    # 3. 会员卡剩余次数 — 使用 get_effective_remaining（唯一真实数据源）
    for cid in customer_ids:
        metrics[cid]["remaining_count"] = membership_card_service.get_effective_remaining(cid)

    return metrics


def _evaluate_condition_cached(condition, customer_id: str, customer, metrics: Dict) -> bool:
    """用预计算的指标评估条件"""
    from datetime import date, datetime
    today = date.today()

    if condition.type == "acquaintance_date":
        if not customer or not customer.created_at:
            return False
        created = customer.created_at.date() if isinstance(customer.created_at, datetime) else customer.created_at
        days = (today - created).days
        if condition.mode == "fixed_cycle":
            return condition.value > 0 and days > 0 and days % condition.value == 0
        if condition.mode == "relative":
            return _compare(condition.operator, days, condition.value)
        return False

    if condition.type == "visit_count":
        count = metrics.get("visit_count", 0)
        if condition.mode == "fixed_cycle":
            return condition.value > 0 and count > 0 and count % condition.value == 0
        return _compare(condition.operator, count, condition.value)

    if condition.type == "activity":
        if condition.mode == "participation_count":
            count = metrics.get("activity_counts", {}).get(condition.activity_type, 0)
            return _compare(condition.operator, count, condition.value)
        if condition.mode == "remaining_count":
            remaining = metrics.get("remaining_count")
            if remaining is None:
                return False
            return _compare(condition.operator, remaining, condition.value)
        return False

    return False


def _compute_all_results(user_id: str, user_role: str) -> List[Dict[str, Any]]:
    """全量计算所有匹配结果，不加过滤"""
    reminders = reminder_service.list_reminders()
    customers = customer_service.list_customers()
    customer_ids = set(c.id for c in customers)
    metrics = _precompute_metrics(customer_ids)

    results = []
    for reminder in reminders:
        if reminder.account_role != "全部" and reminder.account_role != user_role:
            continue
        if reminder.account_id != "全部" and reminder.account_id != user_id:
            continue
        if not reminder.conditions:
            continue

        for customer in customers:
            m = metrics.get(customer.id, {})
            if reminder.condition_logic == "all":
                matched = all(_evaluate_condition_cached(c, customer.id, customer, m) for c in reminder.conditions)
            else:
                matched = any(_evaluate_condition_cached(c, customer.id, customer, m) for c in reminder.conditions)

            if matched:
                status_key = f"{reminder.id}:{customer.id}"
                status = _statuses.get(status_key, {})
                handled = status.get("handled", False)
                cond_descs = [_format_condition(c) for c in reminder.conditions]
                joiner = " 且 " if reminder.condition_logic == "all" else " 或 "
                message = joiner.join(cond_descs)

                results.append({
                    "id": status_key,
                    "customer_id": customer.id,
                    "nickname": customer.nickname,
                    "reminder_id": reminder.id,
                    "reminder_name": reminder.name,
                    "message": message,
                    "handled": handled,
                    "description": status.get("description", ""),
                })

    return results


def evaluate_reminders(user_id: str, user_role: str, handled_filter: Optional[bool] = None) -> List[Dict[str, Any]]:
    """评估所有提醒规则，返回匹配当前用户的触发提醒

    Args:
        handled_filter: None=全部, True=仅已处理, False=仅未处理
    """
    cache_key = f"{user_id}:{user_role}"
    data_version = str(_get_data_version())

    # 快速路径：无锁检查缓存
    if cache_key in _eval_cache:
        entry = _eval_cache[cache_key]
        if entry.get("_version") == data_version:
            results = entry["_results"]
            if handled_filter is not None:
                results = [r for r in results if r["handled"] == handled_filter]
            return results

    # 慢速路径：加锁计算并持久化
    with _cache_lock:
        # 双重检查
        if cache_key in _eval_cache:
            entry = _eval_cache[cache_key]
            if entry.get("_version") == data_version:
                results = entry["_results"]
                if handled_filter is not None:
                    results = [r for r in results if r["handled"] == handled_filter]
                return results

        results = _compute_all_results(user_id, user_role)
        _eval_cache[cache_key] = {"_version": data_version, "_results": results}
        _save_eval_cache()

    if handled_filter is not None:
        results = [r for r in results if r["handled"] == handled_filter]
    return results


def toggle_status(item_id: str, description: str = "") -> bool:
    """切换提醒处理状态"""
    if item_id not in _statuses:
        _statuses[item_id] = {
            "handled": True,
            "description": description or "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        _statuses[item_id]["handled"] = not _statuses[item_id].get("handled", False)
        if description:
            _statuses[item_id]["description"] = description
        _statuses[item_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save(item_id)
    # 清除评估缓存，下次请求会重新计算 handled 状态
    global _eval_cache
    _eval_cache = {}
    _save_eval_cache()
    return _statuses[item_id]["handled"]
