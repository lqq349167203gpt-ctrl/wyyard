import uuid
from datetime import datetime, timezone
from typing import Optional, Dict

from app.models.daily_grouping import DailyGrouping, DailyGroupingUpsert
from app.services.storage import load_data, save_data, save_item
from app.services import visit_service

FILENAME = "daily_groupings.json"
_groupings: Dict[str, DailyGrouping] = {}


def _load():
    global _groupings
    data = load_data(FILENAME) or {}
    _groupings = {}
    for k, v in data.items():
        _groupings[k] = DailyGrouping(**v)


def _save(grouping_id: str = ""):
    if grouping_id:
        grouping = _groupings.get(grouping_id)
        if grouping:
            save_item(FILENAME, grouping_id, grouping.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _groupings.items()}
        save_data(FILENAME, data)


_load()


def get_grouping(date: str) -> Optional[DailyGrouping]:
    """获取某日的分组，按日期查找"""
    for g in _groupings.values():
        if g.date == date:
            return g
    return None


def upsert_grouping(data: DailyGroupingUpsert) -> DailyGrouping:
    """创建或更新某日的分组，校验成员必须为当日到场人员"""
    visits = visit_service.list_visits(data.date)
    visit_ids = {v.customer_id for v in visits}

    for g in data.groups:
        if g.leader_id and g.leader_id not in visit_ids:
            g.leader_id = ""
        if g.deputy_id and g.deputy_id not in visit_ids:
            g.deputy_id = ""
        g.member_ids = [mid for mid in (g.member_ids or []) if mid in visit_ids]

    now = datetime.now(timezone.utc)
    existing = get_grouping(data.date)
    if existing:
        existing.groups = data.groups
        existing.updated_at = now
        _groupings[existing.id] = existing
        _save(existing.id)
        return existing
    else:
        record = DailyGrouping(
            id=str(uuid.uuid4())[:8],
            date=data.date,
            groups=data.groups,
            created_at=now,
            updated_at=now,
        )
        _groupings[record.id] = record
        _save(record.id)
        return record
