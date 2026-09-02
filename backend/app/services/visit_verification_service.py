from datetime import datetime
from typing import Dict, List, Optional

from fastapi import HTTPException

from app.models.visit_verification import VisitVerification
from app.services import storage

FILENAME = "visit_verifications.json"

_verifications: Dict[str, VisitVerification] = {}


def _key(date: str, space_id: str = "") -> str:
    return f"{date}:{space_id}" if space_id else date


def _load() -> None:
    global _verifications
    _verifications = {
        key: VisitVerification(**value)
        for key, value in storage.load_data(FILENAME).items()
    }


def _save(item_id: str) -> None:
    storage.save_item(
        FILENAME,
        item_id,
        _verifications[item_id].model_dump(mode="json"),
    )


_load()


def list_verifications(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    space_id: Optional[str] = None,
) -> List[VisitVerification]:
    result = list(_verifications.values())
    if start_date:
        result = [item for item in result if item.date >= start_date]
    if end_date:
        result = [item for item in result if item.date <= end_date]
    if space_id is not None:
        result = [item for item in result if item.space_id == space_id]
    return sorted(result, key=lambda item: item.date)


def get_verification(date: str, space_id: str = "") -> Optional[VisitVerification]:
    return _verifications.get(_key(date, space_id))


def is_verified(date: str, space_id: str = "") -> bool:
    item = get_verification(date, space_id)
    return bool(item and item.is_verified)


def set_verified(
    date: str,
    space_id: str,
    *,
    verified: bool,
    operator_id: str = "",
    operator: str = "",
) -> VisitVerification:
    item_id = _key(date, space_id)
    item = _verifications.get(item_id)
    now = datetime.now()
    if item is None:
        item = VisitVerification(
            id=item_id,
            date=date,
            space_id=space_id,
            created_at=now,
            updated_at=now,
        )
        _verifications[item_id] = item
    item.is_verified = verified
    item.verified_by_id = operator_id if verified else ""
    item.verified_by = operator if verified else ""
    item.verified_at = now if verified else None
    item.updated_at = now
    _save(item_id)
    return item


def ensure_scope_unverified(date: str, space_id: str = "") -> None:
    if is_verified(date, space_id):
        raise HTTPException(status_code=423, detail="该日期当前空间的邀约已核对，需先解锁后再操作")


def ensure_date_unverified(date: str) -> None:
    """邀约分组当前按日期全局保存；任一空间核对后均不再允许调整分组。"""
    if any(item.date == date and item.is_verified for item in _verifications.values()):
        raise HTTPException(status_code=423, detail="该日期已有邀约完成核对，需先解锁后再调整分组")


def ensure_record_unverified(record) -> None:
    ensure_scope_unverified(record.visit_date, getattr(record, "space_id", "") or "")


def ensure_update_allowed(record, data: dict) -> None:
    """核对后只允许三类协作信息继续写入。"""
    old_space_id = getattr(record, "space_id", "") or ""
    if is_verified(record.visit_date, old_space_id):
        prohibited = set(data) - {"needs", "feedback", "healing_notes"}
        if prohibited:
            raise HTTPException(
                status_code=423,
                detail="该邀约已核对，除来访需求、客户信息和跟进点外不能修改",
            )
        return
    target_date = str(data.get("visit_date") or record.visit_date)
    target_space_id = str(data.get("space_id") if "space_id" in data else old_space_id)
    if (target_date, target_space_id) != (record.visit_date, old_space_id):
        ensure_scope_unverified(target_date, target_space_id)
