"""信息核对：集中检查课表与邀约里容易漏填的信息。

管理端「课表核对」「邀约核对」两个页面用：按天返回每条记录的完整内容 + 缺失项，
让管理者既能一眼看到缺什么，也能当场核对填的内容对不对。
检查项目录放在这里，前端按目录渲染筛选项与默认勾选。
"""

from __future__ import annotations

import json
from datetime import date as date_type
from datetime import timedelta

# 检查项目录：scope 区分课表/邀约，default 决定页面首次打开时默认勾选
CHECK_ITEMS: list[dict] = [
    # 课表
    {"key": "course_teacher", "label": "缺老师", "scope": "course", "default": True},
    {"key": "course_owner", "label": "缺案主", "scope": "course", "default": True},
    {"key": "course_body_parts", "label": "缺部位", "scope": "course", "default": True},
    {"key": "course_name", "label": "缺活动名称", "scope": "course", "default": True},
    {"key": "course_type", "label": "缺活动类型", "scope": "course", "default": True},
    {"key": "course_time", "label": "缺时间", "scope": "course", "default": True},
    {"key": "course_zero_deduction", "label": "扣卡次数为 0", "scope": "course", "default": True},
    {"key": "course_no_participant", "label": "无参与人", "scope": "course", "default": True},
    {"key": "course_intro", "label": "缺简介", "scope": "course", "default": False},
    {"key": "course_publish", "label": "未发布", "scope": "course", "default": False},
    {"key": "course_empty_day", "label": "当天没有课表活动", "scope": "course", "default": False},
    # 邀约
    {"key": "visit_nickname", "label": "缺昵称", "scope": "visit", "default": True},
    {"key": "visit_time", "label": "缺邀约时间", "scope": "visit", "default": True},
    {"key": "visit_needs", "label": "未填来访需求", "scope": "visit", "default": False},
    {"key": "visit_customer_info", "label": "未填客户信息", "scope": "visit", "default": False},
    {"key": "visit_follow_up", "label": "未填跟进点", "scope": "visit", "default": False},
    {"key": "visit_inviter", "label": "缺邀约人", "scope": "visit", "default": False},
    {"key": "visit_receptionist", "label": "缺接待人", "scope": "visit", "default": False},
    {"key": "visit_goal", "label": "缺目标", "scope": "visit", "default": False},
    {"key": "visit_leader", "label": "缺所属组长", "scope": "visit", "default": False},
    {"key": "visit_not_arrived", "label": "未确认到店", "scope": "visit", "default": False},
    {"key": "visit_empty_day", "label": "当天没有邀约", "scope": "visit", "default": False},
]

OWNER_ACTIVITY_TYPES = {"gcs", "ers", "eks"}

# 这两类活动天生就是 0 次扣卡（能量结按部位数单独算、内部课程不扣卡），不算漏填
DEDUCTION_EXEMPT_ACTIVITY_TYPES = {"eks", "ics"}

# 核对（锁定）只从这天起算：之前的历史数据不参与核对，也不需要补锁
LOCK_START_DATE = "2026-07-01"

TYPE_LABELS = {
    "class": "沙龙",
    "gcs": "觉醒游戏",
    "ers": "情绪释放",
    "eks": "能量结",
    "ics": "内部课程",
}


def catalog(scope: str = "") -> list[dict]:
    """返回可勾选的检查项；scope 为空时返回全部。"""
    return [dict(item) for item in CHECK_ITEMS if not scope or item["scope"] == scope]


def default_kinds(scope: str = "") -> list[str]:
    return [item["key"] for item in CHECK_ITEMS if item["default"] and (not scope or item["scope"] == scope)]


def default_kinds_for(scopes: tuple[str, ...]) -> list[str]:
    """按端（课表/邀约）取默认勾选项。"""
    return [item["key"] for item in CHECK_ITEMS if item["default"] and item["scope"] in scopes]


def check(
    start_date: str,
    end_date: str,
    space_id: str = "",
    scopes: tuple[str, ...] = ("course", "visit"),
    kinds: set[str] | None = None,
    visible_customer_ids: set[str] | None = None,
    can_view_visit_need: bool = True,
) -> dict:
    """按天返回当天全部记录（含缺失项）与核对（锁定）状态。"""
    from datetime import date as date_type

    from app.services import customer_service

    # 客户信息按天都要用（昵称/身份/老师姓名），一次取好避免每天重建
    customers = {customer.id: customer for customer in customer_service.list_customers()}
    today = date_type.today().isoformat()
    # 未来的日期还没有数据、也没法核对，一律截到今天
    effective_end = min(_text(end_date) or today, today)
    effective_start = max(_text(start_date) or LOCK_START_DATE, LOCK_START_DATE)
    # 区间整个落在核对起始日之前：直接返回空，不参与核对
    day_list = _date_range(effective_start, effective_end) if effective_end >= effective_start else []
    days: list[dict] = []
    missing_count = 0
    missing_day_count = 0
    unchecked_day_count = 0
    for day in day_list:
        entry: dict = {"date": day}
        day_missing = 0
        unchecked = False
        if "course" in scopes:
            course = _course_block(day, space_id, kinds, customers, visible_customer_ids)
            entry["course"] = course
            day_missing += course["missing_count"]
            unchecked = unchecked or not course["locked"]
        if "visit" in scopes:
            visit = _visit_block(
                day,
                space_id,
                kinds,
                visible_customer_ids,
                customers,
                can_view_need=can_view_visit_need,
            )
            entry["visit"] = visit
            day_missing += visit["missing_count"]
            unchecked = unchecked or not visit["verified"]
        # 核对是按天来的：当天有没有记录都要列出来，方便照样核对并锁定
        entry["missing_count"] = day_missing
        entry["unchecked"] = unchecked
        days.append(entry)
        missing_count += day_missing
        if day_missing:
            missing_day_count += 1
        if unchecked:
            unchecked_day_count += 1
    days.reverse()  # 默认按日期倒序，最近的在前
    return {
        "start_date": effective_start,
        "end_date": effective_end,
        "lock_start_date": LOCK_START_DATE,
        "space_id": space_id,
        "scopes": list(scopes),
        "kinds": sorted(kinds) if kinds is not None else [],
        "days": days,
        "summary": {
            "missing_count": missing_count,
            "missing_day_count": missing_day_count,
            "unchecked_day_count": unchecked_day_count,
            "day_count": len(days),
        },
    }


def _date_range(start_date: str, end_date: str) -> list[str]:
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    if end < start:
        start, end = end, start
    return [
        (start + timedelta(days=offset)).isoformat()
        for offset in range((end - start).days + 1)
    ]


def _text(value) -> str:
    return str(value or "").strip()


def _eks_body_parts(description: str) -> int:
    """能量结的部位数存在 description 的 JSON 里。"""
    try:
        items = json.loads(description or "[]")
    except (TypeError, ValueError):
        return 0
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        return 0
    try:
        return int(items[0].get("count") or 0)
    except (TypeError, ValueError):
        return 0


def _participant_ids(record) -> set[str]:
    ids = {value for value in (getattr(record, "participant_ids", None) or []) if value}
    for group in getattr(record, "groups", None) or []:
        for value in (group.leader_id, group.deputy_id, *(group.member_ids or [])):
            if value:
                ids.add(value)
    withdrawn = set(getattr(record, "withdrawn_participant_ids", None) or [])
    return ids - withdrawn


def _course_rows(
    day: str,
    space_id: str,
    customers: dict,
    visible_customer_ids: set[str] | None,
) -> list[dict]:
    """当天某空间的全部课表活动（含展示字段），字段口径与课表页一致。"""
    from app.services import (
        class_record_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
    )

    def name_of(customer_id: str) -> str:
        if not customer_id:
            return ""
        if visible_customer_ids is not None and customer_id not in visible_customer_ids:
            return ""
        customer = customers.get(customer_id)
        return _text(getattr(customer, "nickname", "")) or _text(getattr(customer, "name", ""))

    def names_of(customer_ids) -> list[str]:
        names: list[str] = []
        for customer_id in customer_ids:
            name = name_of(customer_id)
            if name:
                names.append(name)
        return names

    rows: list[dict] = []

    def add(record, activity_type: str, *, title: str, type_label: str, intro: str, body_parts: int = 0):
        teacher_ids = [value for value in (getattr(record, "teacher_ids", None) or []) if value]
        owner_id = _text(getattr(record, "owner_id", ""))
        participant_ids = _participant_ids(record)
        rows.append({
            "id": f"{activity_type}:{record.id}",
            "activity_type": activity_type,
            "activity_type_label": TYPE_LABELS.get(activity_type, ""),
            "time": _text(record.start_time),
            "end_time": _text(getattr(record, "end_time", "")),
            "title": title or TYPE_LABELS.get(activity_type, ""),
            "type_label": type_label,
            "teacher_ids": teacher_ids,
            "teacher_names": names_of(teacher_ids),
            "owner_id": owner_id,
            "owner_name": name_of(owner_id),
            "body_parts": body_parts,
            "activity_mode": _text(getattr(record, "activity_mode", "")),
            "intro": _text(intro),
            "published": bool(getattr(record, "is_published", False)),
            "public_welfare": bool(getattr(record, "is_public_welfare", False)),
            "deduction_count": int(getattr(record, "membership_deduction_count", 0) or 0),
            "participant_ids": sorted(participant_ids),
            "participant_names": names_of(sorted(participant_ids)),
            "space_id": _text(record.space_id),
            "creator": _text(getattr(record, "created_by", "")),
            "created_by_id": _text(getattr(record, "created_by_id", "")),
            "kinds": [],
        })

    for record in class_record_service.list_records(day):
        if space_id and _text(record.space_id) != space_id:
            continue
        add(
            record,
            "class",
            title=_text(record.activity_name) or _text(record.course_name),
            type_label=_text(record.course_type),
            intro=record.course_description,
        )
    for record in group_case_session_service.list_sessions(day):
        if space_id and _text(record.space_id) != space_id:
            continue
        add(record, "gcs", title=_text(record.name), type_label=TYPE_LABELS["gcs"], intro=record.description)
    for record in emotional_release_session_service.list_sessions(day):
        if space_id and _text(record.space_id) != space_id:
            continue
        add(record, "ers", title=_text(record.name), type_label=TYPE_LABELS["ers"], intro=record.description)
    for record in energy_knot_session_service.list_sessions(day):
        if space_id and _text(record.space_id) != space_id:
            continue
        add(
            record,
            "eks",
            title=_text(record.name),
            type_label=TYPE_LABELS["eks"],
            # 能量结的 description 是部位 JSON，简介只取 course_description，别把 JSON 当简介显示
            intro=record.course_description,
            body_parts=_eks_body_parts(record.description or ""),
        )
    for record in internal_course_session_service.list_sessions(day):
        if space_id and _text(record.space_id) != space_id:
            continue
        add(
            record,
            "ics",
            title=_text(record.course_name),
            type_label=_text(record.course_type),
            intro=record.course_description,
        )
    rows.sort(key=lambda row: (row["time"] or "99:99", row["title"]))
    return rows


def _course_missing(row: dict, kinds: set[str]) -> list[str]:
    missing: list[str] = []
    if "course_teacher" in kinds and not row["teacher_ids"]:
        missing.append("course_teacher")
    if "course_owner" in kinds and row["activity_type"] in OWNER_ACTIVITY_TYPES and not row["owner_id"]:
        missing.append("course_owner")
    if "course_body_parts" in kinds and row["activity_type"] == "eks" and row["body_parts"] <= 0:
        missing.append("course_body_parts")
    if "course_name" in kinds and not row["title"]:
        missing.append("course_name")
    if "course_type" in kinds and not row["type_label"]:
        missing.append("course_type")
    if "course_time" in kinds and not row["time"]:
        missing.append("course_time")
    if (
        "course_zero_deduction" in kinds
        and row["activity_type"] not in DEDUCTION_EXEMPT_ACTIVITY_TYPES
        and not row["public_welfare"]
        and row["deduction_count"] <= 0
    ):
        missing.append("course_zero_deduction")
    if "course_no_participant" in kinds and not row["participant_ids"]:
        missing.append("course_no_participant")
    if "course_intro" in kinds and not row["intro"]:
        missing.append("course_intro")
    if "course_publish" in kinds and not row["published"]:
        missing.append("course_publish")
    return missing


def _visit_rows(
    day: str,
    space_id: str,
    visible_customer_ids: set[str] | None,
    customers: dict,
    *,
    can_view_need: bool = True,
) -> list[dict]:
    """当天某空间的邀约记录（已取消的不参与核对），字段口径与邀约页一致。"""
    from app.services import visit_service

    records = visit_service.list_visits(date=day, space_id=space_id or None)
    records = [
        record
        for record in records
        if not record.is_deleted
        and (visible_customer_ids is None or record.customer_id in visible_customer_ids)
    ]
    records.sort(key=lambda record: (record.sort_order, record.created_at or ""))
    rows: list[dict] = []
    seen_leader = False
    leader_name = ""
    for record in records:
        customer = customers.get(record.customer_id)
        needs = _text(record.needs)
        nickname = _text(getattr(customer, "nickname", ""))
        if record.is_leader:
            leader_name = nickname or leader_name
        rows.append({
            "id": record.id,
            "customer_id": _text(record.customer_id),
            "time": _text(record.visit_time),
            "nickname": nickname,
            "member_type": _text(getattr(customer, "member_type", "")),
            "is_leader": bool(record.is_leader),
            "has_leader": bool(record.is_leader) or seen_leader,
            "leader_name": leader_name if (bool(record.is_leader) or seen_leader) else "",
            "arrived": bool(record.arrived),
            "arrival_time": _text(record.arrival_time),
            "has_needs": bool(needs),
            "needs": needs if can_view_need else "",
            "needs_hidden": bool(needs) and not can_view_need,
            "has_customer_info": bool(_text(record.feedback)),
            "customer_info": _text(record.feedback),
            "has_follow_up": bool(_text(record.healing_notes)),
            "follow_up": _text(record.healing_notes),
            "inviter": _text(record.referrer_handler),
            "receptionist": _text(record.receptionist),
            "goal": _text(record.goal),
            "creator": _text(record.created_by),
            "created_by_id": _text(getattr(record, "created_by_id", "")),
            "cancelled": bool(record.cancelled),
            "kinds": [],
        })
        seen_leader = seen_leader or bool(record.is_leader)
    return rows


def _visit_missing(row: dict, kinds: set[str]) -> list[str]:
    if row.get("cancelled"):
        # 已取消的邀约锁定了，不再算缺失（恢复后重新计）
        return []
    missing: list[str] = []
    if "visit_nickname" in kinds and not row["nickname"]:
        missing.append("visit_nickname")
    if "visit_time" in kinds and not row["time"]:
        missing.append("visit_time")
    if "visit_needs" in kinds and not row["has_needs"]:
        missing.append("visit_needs")
    if "visit_customer_info" in kinds and not row["has_customer_info"]:
        missing.append("visit_customer_info")
    if "visit_follow_up" in kinds and not row["has_follow_up"]:
        missing.append("visit_follow_up")
    if "visit_inviter" in kinds and not row["inviter"]:
        missing.append("visit_inviter")
    if "visit_receptionist" in kinds and not row["receptionist"]:
        missing.append("visit_receptionist")
    if "visit_goal" in kinds and not row["goal"]:
        missing.append("visit_goal")
    if "visit_leader" in kinds and not row["has_leader"]:
        missing.append("visit_leader")
    if "visit_not_arrived" in kinds and not (row["arrived"] and row["arrival_time"]):
        missing.append("visit_not_arrived")
    return missing


def _course_block(
    day: str,
    space_id: str,
    kinds: set[str],
    customers: dict,
    visible_customer_ids: set[str] | None,
) -> dict:
    from app.services import activity_theme_service

    theme = activity_theme_service.get_theme_for_scope(day, space_id)
    rows = _course_rows(day, space_id, customers, visible_customer_ids)
    missing_count = 0
    for row in rows:
        row["kinds"] = _course_missing(row, kinds)
        if row["kinds"]:
            missing_count += 1
    day_kinds = []
    if "course_empty_day" in kinds and not rows:
        day_kinds.append("course_empty_day")
        missing_count += 1
    return {
        "locked": bool(theme and theme.is_locked),
        "locked_by": (theme.locked_by if theme else "") or "",
        "locked_at": (theme.locked_at.isoformat() if theme and theme.locked_at else ""),
        "total": len(rows),
        "rows": rows,
        "missing_count": missing_count,
        "day_kinds": day_kinds,
    }


def _visit_block(
    day: str,
    space_id: str,
    kinds: set[str],
    visible_customer_ids: set[str] | None,
    customers: dict,
    *,
    can_view_need: bool = True,
) -> dict:
    from app.services import visit_verification_service

    verification = visit_verification_service.get_verification(day, space_id)
    rows = _visit_rows(
        day,
        space_id,
        visible_customer_ids,
        customers,
        can_view_need=can_view_need,
    )
    missing_count = 0
    for row in rows:
        row["kinds"] = _visit_missing(row, kinds)
        if row["kinds"]:
            missing_count += 1
    day_kinds = []
    if "visit_empty_day" in kinds and not rows:
        day_kinds.append("visit_empty_day")
        missing_count += 1
    return {
        "verified": bool(verification and verification.is_verified),
        "verified_by": (verification.verified_by if verification else "") or "",
        "verified_at": (
            verification.verified_at.isoformat()
            if verification and verification.verified_at
            else ""
        ),
        "total": len(rows),
        "rows": rows,
        "missing_count": missing_count,
        "day_kinds": day_kinds,
    }
