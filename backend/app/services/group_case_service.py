import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.group_case import GroupCase, GroupCaseCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "group_cases.json"
_cases: Dict[str, GroupCase] = {}


def _migrate_closers(item: GroupCase) -> GroupCase:
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]
    return item


def _load():
    global _cases
    data = load_data(FILENAME)
    _cases = {}
    for k, v in data.items():
        _cases[k] = _migrate_closers(GroupCase(**v))


def _save(case_id: str = ""):
    if case_id:
        item = _cases.get(case_id)
        if item:
            save_item(FILENAME, case_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _cases.items()}
        save_data(FILENAME, data)


_load()


def list_cases() -> List[GroupCase]:
    return [v for v in _cases.values() if not v.is_deleted]


def get_case(case_id: str) -> Optional[GroupCase]:
    case = _cases.get(case_id)
    if case and case.is_deleted:
        return None
    return case


def create_case(data: GroupCaseCreate) -> GroupCase:
    now = datetime.now(timezone.utc)
    case = GroupCase(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _cases[case.id] = case
    _save(case.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(case.customer_id)
    return case


def update_case(case_id: str, data: dict) -> Optional[GroupCase]:
    case = _cases.get(case_id)
    if not case:
        return None
    for key, value in data.items():
        if hasattr(case, key) and key not in ("id", "created_at"):
            setattr(case, key, value)
    case.updated_at = datetime.now(timezone.utc)
    _cases[case_id] = case
    _save(case_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(case.customer_id)
    return case


def delete_case(case_id: str) -> tuple[bool, str]:
    case = _cases.get(case_id)
    if not case:
        return False, "记录不存在"
    from app.services import group_case_session_service
    remaining = group_case_session_service.get_remaining_count(case.customer_id)
    if remaining - case.purchase_count < 0:
        return False, "该记录中有正在被使用的次数，无法删除"
    case.is_deleted = True
    case.deleted_at = datetime.now(timezone.utc)
    _save(case_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(case.customer_id)
    return True, "删除成功"


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
