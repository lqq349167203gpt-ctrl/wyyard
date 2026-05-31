import uuid
from datetime import datetime, timezone
from typing import Optional, Dict

from app.models.daily_grouping import DailyGrouping, DailyGroupingUpsert
from app.services.storage import load_data, save_data
from app.services import visit_service

FILENAME = "daily_groupings.json"
_groupings: Dict[str, DailyGrouping] = {}


def _load():
    global _groupings
    data = load_data(FILENAME) or {}
    _groupings = {}
    for k, v in data.items():
        _groupings[k] = DailyGrouping(**v)


def _save():
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
        for member_id in [g.leader_id, g.deputy_id] + (g.member_ids or []):
            if member_id and member_id not in visit_ids:
                raise ValueError(f"成员 {member_id} 不在 {data.date} 的到场名单中")

    now = datetime.now(timezone.utc)
    existing = get_grouping(data.date)
    if existing:
        existing.groups = data.groups
        existing.updated_at = now
        _groupings[existing.id] = existing
        _save()
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
        _save()
        return record
