"""课表按日期与空间的核对锁校验。"""

from typing import Iterable

from fastapi import HTTPException

from app.services import activity_theme_service

LOCKED_MESSAGE = "该日期当前空间的课表已核对锁定，请先解锁后再修改"

# 锁定后仍然可以补的字段：课程复盘是课后才写的，不该被核对锁拦住
REVIEW_EXEMPT_FIELDS = frozenset({"course_review"})


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


def _normalize_value(value):
    if value is None:
        return ""
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_value(item) for key, item in value.items()}
    return value


def _only_changes_in(record: object, data: dict, fields: set[str]) -> bool:
    """本次更新除 fields 之外有没有改动；判定不了一律按「有改动」处理。"""
    if not hasattr(record, "model_dump"):
        return False
    snapshot = record.model_dump(mode="json")
    for key, value in data.items():
        if key in fields or key not in snapshot:
            continue
        if _normalize_value(value) != _normalize_value(snapshot[key]):
            return False
    return True


def ensure_update_unlocked(
    record: object,
    data: dict,
    exempt_fields: Iterable[str] = (),
) -> None:
    """同时校验原位置和更新后的目标位置，防止通过跨日移动绕过锁。

    exempt_fields 里的字段不受锁限制（例如课程复盘：核对锁定后仍要能补写）。
    """
    if exempt_fields and _only_changes_in(record, data, set(exempt_fields)):
        return
    ensure_record_unlocked(record)
    target_date = str(data.get("date", getattr(record, "date", "")) or "")
    target_space_id = str(data.get("space_id", getattr(record, "space_id", "")) or "")
    ensure_scope_unlocked(target_date, target_space_id)
