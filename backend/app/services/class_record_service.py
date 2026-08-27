import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.class_record import ClassRecord, ClassRecordCreate
from app.services import customer_service, membership_card_service
from app.services.storage import load_data, save_data, save_item

FILENAME = "class_records.json"
_records: Dict[str, ClassRecord] = {}
_record_lock = threading.Lock()


def _load():
    global _records
    data = load_data(FILENAME)
    _records = {}
    for k, v in data.items():
        _records[k] = ClassRecord(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _records.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _records.items()}
        save_data(FILENAME, data)


_load()


def _build_course_map() -> dict:
    from app.services.course_service import list_courses
    return {c.id: {"name": c.name, "type": getattr(c, "type", "")} for c in list_courses()}


def _fill_course_name(records: List[ClassRecord]) -> List[ClassRecord]:
    course_map = _build_course_map()
    for r in records:
        if r.course_id and r.course_id in course_map:
            if not r.activity_name:
                r.course_name = course_map[r.course_id]["name"]
            if not r.course_type:
                r.course_type = course_map[r.course_id]["type"]
    return records


def list_records(date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[ClassRecord]:
    records = [v for v in _records.values() if not v.is_deleted]
    if date:
        records = [r for r in records if r.date == date]
    if start_date:
        records = [r for r in records if r.date >= start_date]
    if end_date:
        records = [r for r in records if r.date <= end_date]
    records.sort(key=lambda r: r.created_at, reverse=True)
    return _fill_course_name(records)


def get_record(record_id: str) -> Optional[ClassRecord]:
    record = _records.get(record_id)
    if record and record.is_deleted:
        return None
    return record


def _get_group_member_ids(record) -> set:
    """从 groups 和 participant_ids 中提取所有可扣费人员 ID（不含 teacher_ids）"""
    ids = set(record.participant_ids)
    for g in record.groups:
        if g.leader_id:
            ids.add(g.leader_id)
        if g.deputy_id:
            ids.add(g.deputy_id)
        ids.update(g.member_ids)
    # 排除课程老师
    ids -= set(record.teacher_ids)
    return ids


def _deduct_for_record(record):
    """为新创建的沙龙活动扣费（公益类不扣费）"""
    if record.is_public_welfare:
        return
    chargeable = membership_card_service.filter_arrived_customer_ids(
        record.date,
        _get_group_member_ids(record),
    )
    activity_key = f"class:{record.id}"
    deduction_count = membership_card_service.get_activity_deduction_count(record)
    with membership_card_service._deduct_lock:
        for cid in chargeable:
            membership_card_service._do_sync_activity_count(cid, activity_key, deduction_count)
        membership_card_service._save_customer_usages(chargeable)


def _restore_for_record(record):
    """为删除的沙龙活动退费"""
    chargeable = _get_group_member_ids(record)
    activity_key = f"class:{record.id}"
    with membership_card_service._deduct_lock:
        for cid in chargeable:
            membership_card_service._do_sync_activity_count(cid, activity_key, 0)
        membership_card_service._save_customer_usages(chargeable)


def _sync_deduction(record, old_chargeable, new_chargeable):
    """同步参与人员、公益状态和单场扣卡次数。"""
    old_chargeable = membership_card_service.filter_arrived_customer_ids(record.date, old_chargeable)
    new_chargeable = membership_card_service.filter_arrived_customer_ids(record.date, new_chargeable)
    activity_key = f"class:{record.id}"
    deduction_count = (
        0
        if record.is_public_welfare
        else membership_card_service.get_activity_deduction_count(record)
    )
    with membership_card_service._deduct_lock:
        affected_ids = old_chargeable | new_chargeable
        for cid in affected_ids:
            target_count = deduction_count if cid in new_chargeable else 0
            membership_card_service._do_sync_activity_count(cid, activity_key, target_count)
        membership_card_service._save_customer_usages(affected_ids)


def _refresh_affected_identities(customer_ids: set):
    """刷新受影响客户的会员身份"""
    from app.services.member_identity_service import refresh_member_type
    for cid in customer_ids:
        if cid:
            try:
                refresh_member_type(cid)
            except Exception:
                pass


def _get_all_member_ids(record) -> set:
    """获取记录中所有相关人员 ID（参与者 + 老师 + 分组成员）"""
    ids = set(record.participant_ids or [])
    ids.update(record.teacher_ids or [])
    for g in record.groups:
        if g.leader_id:
            ids.add(g.leader_id)
        if g.deputy_id:
            ids.add(g.deputy_id)
        ids.update(g.member_ids or [])
    return ids


def create_record(data: ClassRecordCreate, refresh_identities: bool = True) -> ClassRecord:
    now = datetime.now(timezone.utc)
    record = ClassRecord(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _records[record.id] = record
    _save(record.id)
    _deduct_for_record(record)
    if refresh_identities:
        _refresh_affected_identities(_get_all_member_ids(record))
    return record


def update_record(
    record_id: str,
    data: dict,
    refresh_identities: bool = True,
    sync_deductions: bool = True,
) -> Optional[ClassRecord]:
    with _record_lock:
        record = _records.get(record_id)
        if not record or record.is_deleted:
            return None

        # 获取旧状态
        old_chargeable = _get_group_member_ids(record)

        for key, value in data.items():
            if hasattr(record, key) and key not in ("id", "created_at", "created_by_id", "created_by", "is_deleted", "deleted_at"):
                setattr(record, key, value)
        record.membership_deduction_count = (
            0
            if record.is_public_welfare
            else max(1, int(record.membership_deduction_count or 1))
        )
        record.updated_at = datetime.now(timezone.utc)
        _records[record_id] = record
        _save(record_id)

        new_chargeable = _get_group_member_ids(record)
        if sync_deductions:
            _sync_deduction(record, old_chargeable, new_chargeable)

        # 刷新所有受影响客户的会员身份（旧参与者 + 新参与者）
        if refresh_identities:
            _refresh_affected_identities(old_chargeable | _get_all_member_ids(record))
        return record


def update_participants(record_id: str, participant_ids: List[str]):
    """返回 (record, []) 成功, (None, []) 未找到"""
    record = _records.get(record_id)
    if not record or record.is_deleted:
        return None, []
    old_chargeable = _get_group_member_ids(record)
    old_ids = _get_all_member_ids(record)
    record.participant_ids = participant_ids
    new_chargeable = _get_group_member_ids(record)
    _sync_deduction(record, old_chargeable, new_chargeable)
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save(record_id)
    _refresh_affected_identities(old_ids | _get_all_member_ids(record))
    return record, []


def delete_record(record_id: str, refresh_identities: bool = True) -> bool:
    record = _records.get(record_id)
    if not record or record.is_deleted:
        return False
    affected_ids = _get_all_member_ids(record)
    _restore_for_record(record)
    record.is_deleted = True
    record.deleted_at = datetime.now(timezone.utc)
    _save(record_id)
    if refresh_identities:
        _refresh_affected_identities(affected_ids)
    return True


def update_groups(record_id: str, groups: list):
    """返回 (record, []) 成功, (None, []) 未找到"""
    from app.models.class_record import GroupMember
    from app.services import visit_service

    record = _records.get(record_id)
    if not record or record.is_deleted:
        return None, []

    # 校验成员必须在当日到场名单中，自动过滤已删除的人员
    visits = visit_service.list_visits(record.date)
    visit_ids = {v.customer_id for v in visits}

    all_member_ids = set()
    for g in groups:
        lid = g.get("leader_id", "")
        did = g.get("deputy_id", "")
        mids = g.get("member_ids", [])
        if lid and lid not in visit_ids:
            g["leader_id"] = ""
        elif lid:
            all_member_ids.add(lid)
        if did and did not in visit_ids:
            g["deputy_id"] = ""
        elif did:
            all_member_ids.add(did)
        valid_mids = [mid for mid in mids if mid in visit_ids]
        g["member_ids"] = valid_mids
        all_member_ids.update(valid_mids)

    old_ids = _get_all_member_ids(record)
    old_chargeable = _get_group_member_ids(record)
    record.participant_ids = list(all_member_ids)
    record.groups = [GroupMember(**g) for g in groups]
    new_chargeable = _get_group_member_ids(record)
    _sync_deduction(record, old_chargeable, new_chargeable)
    record.updated_at = datetime.now(timezone.utc)
    _records[record_id] = record
    _save(record_id)
    _refresh_affected_identities(old_ids | _get_all_member_ids(record))
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


def rename_course_name(old_name: str, new_name: str) -> int:
    count = 0
    for record in _records.values():
        if record.course_name == old_name:
            record.course_name = new_name
            _save(record.id)
            count += 1
    return count


def rename_course_type(old_type: str, new_type: str) -> int:
    count = 0
    for record in _records.values():
        if record.course_type == old_type:
            record.course_type = new_type
            _save(record.id)
            count += 1
    return count
