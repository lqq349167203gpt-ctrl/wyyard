from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from app.services import account_service, visit_note_service, visit_service

FOLLOW_UP_CATEGORY_LABELS = {
    "visit_need": "来访需求",
    "customer_info": "客户信息",
    "follow_up": "跟进点",
}
FOLLOW_UP_FILTERS = {"inactive_30", "active_30", "all"}


def _aware_datetime(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def available_teachers(customers: Iterable[Any], current_teacher: str = "") -> list[str]:
    names = {
        str(getattr(customer, "service_teacher", "") or "").strip()
        for customer in customers
        if str(getattr(customer, "service_teacher", "") or "").strip()
    }
    current = current_teacher.strip()
    if current:
        names.discard(current)
    ordered = sorted(names, key=lambda value: value.casefold())
    return [current, *ordered] if current else ordered


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


def _latest_teacher_notes(customer_ids: set[str], teacher: str) -> dict[str, Any]:
    visits = visit_service.list_basic_visits(customer_ids)
    customer_by_visit = {visit.id: visit.customer_id for visit in visits}
    account_ids, teacher_names = _teacher_accounts(teacher)
    latest: dict[str, Any] = {}
    for note in visit_note_service.list_notes(customer_by_visit):
        matches_account = bool(note.created_by_id and note.created_by_id in account_ids)
        matches_name = bool(note.created_by and note.created_by.strip() in teacher_names)
        if not matches_account and not matches_name:
            continue
        customer_id = customer_by_visit.get(note.visit_id, "")
        if not customer_id:
            continue
        previous = latest.get(customer_id)
        if previous is None or _aware_datetime(note.updated_at) > _aware_datetime(previous.updated_at):
            latest[customer_id] = note
    return latest


def list_teacher_customers(
    customers: Iterable[Any],
    teacher: str,
    follow_up_filter: str = "inactive_30",
    nickname: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    if follow_up_filter not in FOLLOW_UP_FILTERS:
        follow_up_filter = "inactive_30"
    normalized_teacher = teacher.strip()
    assigned = [
        customer
        for customer in customers
        if str(getattr(customer, "service_teacher", "") or "").strip() == normalized_teacher
    ]
    latest_notes = _latest_teacher_notes({customer.id for customer in assigned}, normalized_teacher)
    threshold = datetime.now(timezone.utc) - timedelta(days=30)

    rows: list[dict[str, Any]] = []
    for customer in assigned:
        note = latest_notes.get(customer.id)
        note_updated_at = _aware_datetime(note.updated_at) if note else None
        is_active = bool(note_updated_at and note_updated_at >= threshold)
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
            "last_follow_up_by": (note.created_by or normalized_teacher) if note else "",
            "is_active_30": is_active,
        })

    summary = {
        "total": len(rows),
        "active_30": sum(1 for row in rows if row["is_active_30"]),
        "inactive_30": sum(1 for row in rows if not row["is_active_30"]),
    }
    search = nickname.strip().casefold()
    if search:
        rows = [
            row for row in rows
            if search in row["nickname"].casefold() or search in row["name"].casefold()
        ]
    if follow_up_filter == "inactive_30":
        rows = [row for row in rows if not row["is_active_30"]]
    elif follow_up_filter == "active_30":
        rows = [row for row in rows if row["is_active_30"]]

    # 未跟进客户优先，其次按最近跟进时间从早到晚，便于老师先处理最久未跟进的人。
    rows.sort(key=lambda row: (bool(row["last_follow_up_at"]), row["last_follow_up_at"], row["nickname"].casefold()))
    total = len(rows)
    total_pages = max(1, (total + page_size - 1) // page_size)
    resolved_page = min(max(page, 1), total_pages)
    start = (resolved_page - 1) * page_size
    return {
        "teacher": normalized_teacher,
        "summary": summary,
        "items": rows[start:start + page_size],
        "total": total,
        "page": resolved_page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
