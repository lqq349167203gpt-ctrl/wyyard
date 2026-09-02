"""课表按日期与空间的核对锁校验。"""

from fastapi import HTTPException

from app.services import activity_theme_service

LOCKED_MESSAGE = "该日期当前空间的课表已核对锁定，请先解锁后再修改"


def ensure_scope_unlocked(date: str, space_id: str = "") -> None:
    if date and activity_theme_service.is_locked(date, space_id or ""):
        raise HTTPException(status_code=423, detail=LOCKED_MESSAGE)


def ensure_record_unlocked(record: object | None) -> None:
    if record is None:
        return
    ensure_scope_unlocked(
        getattr(record, "date", "") or "",
        getattr(record, "space_id", "") or "",
    )


def ensure_update_unlocked(record: object, data: dict) -> None:
    """同时校验原位置和更新后的目标位置，防止通过跨日移动绕过锁。"""
    ensure_record_unlocked(record)
    target_date = str(data.get("date", getattr(record, "date", "")) or "")
    target_space_id = str(data.get("space_id", getattr(record, "space_id", "")) or "")
    ensure_scope_unlocked(target_date, target_space_id)
