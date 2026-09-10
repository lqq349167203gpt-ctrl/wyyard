from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from app.services import account_service, visit_note_service, visit_service

FOLLOW_UP_CATEGORY_LABELS = {
    "visit_need": "来访需求",
    "customer_info": "客户信息",
    "follow_up": "跟进点",
}
FOLLOW_UP_FILTERS = {"inactive", "active", "all", "inactive_30", "active_30"}
FOLLOW_UP_NOTE_CATEGORIES = {"customer_info", "follow_up"}
FOLLOW_UP_DEFINITIONS = {*FOLLOW_UP_NOTE_CATEGORIES, "both", "none"}
TEACHER_POSITIONS = {"成就君", "能量结老师", "课程老师"}


def _aware_datetime(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _note_author(note: Any) -> str:
    creator = str(getattr(note, "created_by", "") or "").strip()
    return creator if creator and creator != "历史记录" else "未知"


def available_teachers(customers: Iterable[Any], current_teacher: str = "") -> list[str]:
    counts = Counter(
        str(getattr(customer, "service_teacher", "") or "").strip()
        for customer in customers
        if str(getattr(customer, "service_teacher", "") or "").strip()
    )
    current = current_teacher.strip()
    names = set(counts)
    if current:
        names.add(current)
    return sorted(names, key=lambda value: (-counts[value], value.casefold()))


def teacher_options(teacher_names: Iterable[str], customers: Iterable[Any]) -> list[dict[str, str]]:
    """把服务老师姓名关联到课程记录使用的客户 ID。"""
    customer_list = list(customers)
    options: list[dict[str, str]] = []
    for raw_name in teacher_names:
        name = str(raw_name or "").strip()
        if not name:
            continue
        normalized = name.casefold()
        matches = [
            customer
            for customer in customer_list
            if normalized in {
                str(getattr(customer, "nickname", "") or "").strip().casefold(),
                str(getattr(customer, "name", "") or "").strip().casefold(),
            }
        ]
        matches.sort(key=lambda customer: (
            not bool(TEACHER_POSITIONS.intersection(getattr(customer, "positions", []) or [])),
            str(getattr(customer, "nickname", "") or "") != name,
            str(getattr(customer, "id", "") or ""),
        ))
        options.append({
            "name": name,
            "customer_id": str(getattr(matches[0], "id", "") or "") if matches else "",
        })
    return options


def _teacher_accounts(teacher: str) -> tuple[set[str], set[str]]:
    normalized = teacher.strip()
    account_ids: set[str] = set()
    names = {normalized} if normalized else set()
    for account in account_service.list_accounts():
        owner = str(account.owner or "").strip()
        username = str(account.username or "").strip()
        if normalized and normalized not in {owner, username}:
            continue
        account_ids.add(account.id)
        names.update(value for value in (owner, username) if value)
    return account_ids, names


def _latest_teacher_notes(customer_ids: set[str], teacher: str) -> dict[str, dict[str, Any]]:
    visits = visit_service.list_basic_visits(customer_ids)
    customer_by_visit = {visit.id: visit.customer_id for visit in visits}
    account_ids, teacher_names = _teacher_accounts(teacher)
    latest: dict[str, dict[str, Any]] = {}
    for note in visit_note_service.list_notes(customer_by_visit):
        matches_account = bool(note.created_by_id and note.created_by_id in account_ids)
        matches_name = bool(note.created_by and note.created_by.strip() in teacher_names)
        if not matches_account and not matches_name:
            continue
        customer_id = customer_by_visit.get(note.visit_id, "")
        if not customer_id or note.category not in FOLLOW_UP_NOTE_CATEGORIES:
            continue
        customer_notes = latest.setdefault(customer_id, {})
        previous = customer_notes.get(note.category)
        if previous is None or _aware_datetime(note.updated_at) > _aware_datetime(previous.updated_at):
            customer_notes[note.category] = note
    return latest


def list_teacher_customers(
    customers: Iterable[Any],
    teacher: str,
    follow_up_filter: str = "inactive",
    follow_up_definition: str = "follow_up",
    follow_up_days: int = 30,
    nickname: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    if follow_up_filter not in FOLLOW_UP_FILTERS:
        follow_up_filter = "inactive"
    follow_up_filter = {"inactive_30": "inactive", "active_30": "active"}.get(
        follow_up_filter, follow_up_filter
    )
    if follow_up_definition not in FOLLOW_UP_DEFINITIONS:
        follow_up_definition = "follow_up"
    follow_up_days = max(1, min(int(follow_up_days or 30), 3650))
    normalized_teacher = teacher.strip()
    assigned = [
        customer
        for customer in customers
        if str(getattr(customer, "service_teacher", "") or "").strip() == normalized_teacher
    ]
    latest_notes = _latest_teacher_notes({customer.id for customer in assigned}, normalized_teacher)
    threshold = datetime.now(timezone.utc) - timedelta(days=follow_up_days)

    rows: list[dict[str, Any]] = []
    for customer in assigned:
        notes = latest_notes.get(customer.id, {})
        customer_info_note = notes.get("customer_info")
        follow_up_note = notes.get("follow_up")
        if follow_up_definition == "both":
            selected_notes = [customer_info_note, follow_up_note]
            is_active = all(
                note and _aware_datetime(note.updated_at) >= threshold
                for note in selected_notes
            )
            note = min(
                (item for item in selected_notes if item),
                key=lambda item: _aware_datetime(item.updated_at),
                default=None,
            ) if all(selected_notes) else None
        elif follow_up_definition == "none":
            selected_notes = [item for item in (customer_info_note, follow_up_note) if item]
            note = max(
                selected_notes,
                key=lambda item: _aware_datetime(item.updated_at),
                default=None,
            )
            is_active = bool(note and _aware_datetime(note.updated_at) >= threshold)
        else:
            note = notes.get(follow_up_definition)
            is_active = bool(note and _aware_datetime(note.updated_at) >= threshold)
        note_updated_at = _aware_datetime(note.updated_at) if note else None
        follow_up_status = getattr(customer, "follow_up_status", "")
        rows.append({
            "id": customer.id,
            "nickname": customer.nickname or "",
            "name": customer.name or "",
            "member_type": customer.member_type or "",
            "follow_up_status": getattr(follow_up_status, "value", follow_up_status) or "未配置",
            "service_teacher": customer.service_teacher or "",
            "last_follow_up_at": note_updated_at.isoformat() if note_updated_at else "",
            "last_follow_up_category": FOLLOW_UP_CATEGORY_LABELS.get(note.category, "") if note else "",
            "last_follow_up_by": _note_author(note) if note else "",
            "latest_customer_info_content": customer_info_note.content if customer_info_note else "",
            "latest_customer_info_by": _note_author(customer_info_note) if customer_info_note else "",
            "latest_customer_info_at": (
                _aware_datetime(customer_info_note.updated_at).isoformat()
                if customer_info_note else ""
            ),
            "latest_follow_up_content": follow_up_note.content if follow_up_note else "",
            "latest_follow_up_by": _note_author(follow_up_note) if follow_up_note else "",
            "latest_follow_up_at": (
                _aware_datetime(follow_up_note.updated_at).isoformat()
                if follow_up_note else ""
            ),
            "is_active": is_active,
            "is_active_30": is_active,
        })

    active_count = sum(1 for row in rows if row["is_active"])
    inactive_count = sum(1 for row in rows if not row["is_active"])
    summary = {
        "total": len(rows),
        "active": active_count,
        "inactive": inactive_count,
        "active_30": active_count,
        "inactive_30": inactive_count,
    }
    search = nickname.strip().casefold()
    if search:
        rows = [
            row for row in rows
            if search in row["nickname"].casefold() or search in row["name"].casefold()
        ]
    if follow_up_filter == "inactive":
        rows = [row for row in rows if not row["is_active"]]
    elif follow_up_filter == "active":
        rows = [row for row in rows if row["is_active"]]

    # 未跟进客户优先，其次按最近跟进时间从早到晚，便于老师先处理最久未跟进的人。
    rows.sort(key=lambda row: (bool(row["last_follow_up_at"]), row["last_follow_up_at"], row["nickname"].casefold()))
    total = len(rows)
    total_pages = max(1, (total + page_size - 1) // page_size)
    resolved_page = min(max(page, 1), total_pages)
    start = (resolved_page - 1) * page_size
    return {
        "teacher": normalized_teacher,
        "follow_up_definition": follow_up_definition,
        "follow_up_days": follow_up_days,
        "summary": summary,
        "items": rows[start:start + page_size],
        "total": total,
        "page": resolved_page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
