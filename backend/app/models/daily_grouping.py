from app.models.base import SafeBaseModel, StrictBaseModel
from datetime import datetime
from typing import List


class GroupInfo(SafeBaseModel):
    name: str = ""
    leader_id: str = ""
    deputy_id: str = ""
    member_ids: List[str] = []


class DailyGrouping(SafeBaseModel):
    id: str
    date: str
    groups: List[GroupInfo] = []
    created_at: datetime
    updated_at: datetime


class DailyGroupingUpsert(StrictBaseModel):
    date: str
    groups: List[GroupInfo] = []
