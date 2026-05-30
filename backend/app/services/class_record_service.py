import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.class_record import ClassRecord, ClassRecordCreate
from app.services.storage import load_data, save_data
from app.services import customer_service, membership_card_service

FILENAME = "class_records.json"
_records: Dict[str, ClassRecord] = {}


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {}
    for k, v in data.items():
        _records[k] = ClassRecord(**v)


def _save():
    data = {k: v.model_dump(mode="json") for k, v in _records.items()}
    save_data(FILENAME, data)


_load()


def list_records(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[ClassRecord]:
    records = [v for v in _records.values() if not v.is_deleted]
    if date:
        records = [r for r in records if r.date == date]
    if start_date:
        records = [r for r in records if r.date >= start_date]
    if end_date:
        records = [r for r in records if r.date <= end_date]
    records.sort(key=lambda r: r.created_at, reverse=True)
    return records


def get_record(record_id: str) -> Optional[ClassRecord]:
    record = _records.get(record_id)
    if record and record.is_deleted:
        return None
    return record


def create_record(data: ClassRecordCreate) -> ClassRecord:
    now = datetime.now(timezone.utc)
    record = ClassRecord(
        id=str(uuid.uuid4())[:8],
        participant_ids=[],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _records[record.id] = record
    _save()
    return record


def update_record(record_id: str, data: dict) -> Optional[ClassRecord]:
    record = _records.get(record_id)
    if not record:
        return None
    for key, value in data.items():
        if hasattr(record, key) and key not in ("id", "created_at"):
            setattr(record, key, value)
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save()
    return record


def _get_group_member_ids(record) -> set:
    """从 groups 中提取所有组员 ID（不含 teacher_ids）"""
    ids = set()
    for g in record.groups:
        if g.leader_id:
            ids.add(g.leader_id)
        if g.deputy_id:
            ids.add(g.deputy_id)
        ids.update(g.member_ids)
    # 排除课程老师
    ids -= set(record.teacher_ids)
    return ids


def update_participants(record_id: str, participant_ids: List[str]):
    """返回 (record, []) 成功, (None, []) 未找到"""
    record = _records.get(record_id)
    if not record:
        return None, []
    record.participant_ids = participant_ids
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save()
    return record, []


def delete_record(record_id: str) -> bool:
    record = _records.get(record_id)
    if not record:
        return False
    record.is_deleted = True
    record.deleted_at = datetime.now(timezone.utc)
    _save()
    return True


def update_groups(record_id: str, groups: list):
    """返回 (record, []) 成功, (None, []) 未找到"""
    from app.models.class_record import GroupMember
    record = _records.get(record_id)
    if not record:
        return None, []

    all_member_ids = set()
    for g in groups:
        lid = g.get("leader_id", "")
        did = g.get("deputy_id", "")
        mids = g.get("member_ids", [])
        if lid:
            all_member_ids.add(lid)
        if did:
            all_member_ids.add(did)
        for mid in mids:
            all_member_ids.add(mid)

    record.participant_ids = list(all_member_ids)
    record.groups = [GroupMember(**g) for g in groups]
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save()
    return record, []


def _get_card_remaining(customer_id: str) -> int:
    """会员活动剩余次数：无卡=0，不限次=-1，有次数=具体数字"""
    cards = [c for c in membership_card_service.list_cards() if c.customer_id == customer_id]
    if not cards:
        return 0
    cards.sort(key=lambda c: c.created_at, reverse=True)
    return cards[0].remaining_count if cards[0].remaining_count is not None else -1


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
                "remaining": _get_card_remaining(c.id),
            })
    return results
