from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class GroupInfo(BaseModel):
    name: str = ""
    leader_id: str = ""
    deputy_id: str = ""
    member_ids: List[str] = []


class DailyGrouping(BaseModel):
    id: str
    date: str
    groups: List[GroupInfo] = []
    created_at: datetime
    updated_at: datetime


class DailyGroupingUpsert(BaseModel):
    date: str
    groups: List[GroupInfo] = []
