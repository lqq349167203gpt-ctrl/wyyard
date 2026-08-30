from datetime import datetime, timezone

from app.services import client_notification_service

ACTIVITY_TYPE_NAMES = {
    "class": "沙龙活动",
    "gcs": "觉醒游戏",
    "ers": "情绪释放",
    "eks": "能量结",
    "ics": "内部课程",

}


def _value(activity, field: str, default=None):
    if isinstance(activity, dict):
        return activity.get(field, default)
    return getattr(activity, field, default)


def get_member_ids(activity) -> set[str]:
    """返回活动中所有具有参与身份的客户 ID。"""
    if not activity:
        return set()

    member_ids = set(_value(activity, "participant_ids", []) or [])
    member_ids.update(_value(activity, "teacher_ids", []) or [])
    for field in ("owner_id", "host_id", "achiever_id"):
        customer_id = _value(activity, field, "")
        if customer_id:
            member_ids.add(customer_id)

    for group in _value(activity, "groups", []) or []:
        member_ids.update(_value(group, "member_ids", []) or [])
        for field in ("leader_id", "deputy_id"):
            customer_id = _value(group, field, "")
            if customer_id:
                member_ids.add(customer_id)

    member_ids -= set(_value(activity, "withdrawn_participant_ids", []) or [])

    return {customer_id for customer_id in member_ids if customer_id}


def _role_label(activity_type: str, activity, customer_id: str) -> str:
    if customer_id == _value(activity, "owner_id", ""):
        return "案主"
    if customer_id == _value(activity, "achiever_id", ""):
        return "成就君"
    if customer_id == _value(activity, "host_id", ""):
        return "老师" if activity_type in {"eks", "ics"} else "成就君"
    if customer_id in (_value(activity, "teacher_ids", []) or []):
        return "老师"
    return "参与者"


def _activity_name(activity_type: str, activity) -> str:
    name = (
        _value(activity, "activity_name", "")
        or _value(activity, "name", "")
        or _value(activity, "course_name", "")
    )
    return name or ACTIVITY_TYPE_NAMES.get(activity_type, "活动")


def _notification_time(activity) -> datetime:
    value = _value(activity, "updated_at") or _value(activity, "created_at")
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if value:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def notify_new_assignments(
    activity_type: str,
    activity,
    previous_member_ids: set[str] | None = None,
    operator: str = "",
) -> None:
    """向本次新加入活动的客户发送一条幂等的活动安排通知。"""
    if not activity:
        return

    added_ids = get_member_ids(activity) - (previous_member_ids or set())
    if not added_ids:
        return

    activity_id = str(_value(activity, "id", ""))
    activity_name = _activity_name(activity_type, activity)
    activity_date = str(_value(activity, "date", "") or "")
    start_time = str(_value(activity, "start_time", "") or "")
    end_time = str(_value(activity, "end_time", "") or "")
    time_text = ""
    if start_time and end_time:
        time_text = f"{start_time}-{end_time}"
    elif start_time:
        time_text = start_time

    notification_time = _notification_time(activity)
    version = notification_time.isoformat()
    is_published = bool(_value(activity, "is_published", False))

    for customer_id in added_ids:
        content_lines = [
            f"活动名称：{activity_name}",
            f"身份：{_role_label(activity_type, activity, customer_id)}",
        ]
        if time_text:
            content_lines.insert(1, f"活动时间：{time_text}")
        if not is_published:
            content_lines.append("活动暂未发布，可在“我的活动”中查看")

        client_notification_service.ensure_notification(
            source_key=f"activity-assignment:{activity_type}:{activity_id}:{version}",
            customer_id=customer_id,
            type="activity_assigned",
            title="活动安排",
            content="\n".join(content_lines),
            created_at=notification_time,
            activity_name=activity_name,
            activity_date=activity_date,
            operator=operator,
        )
