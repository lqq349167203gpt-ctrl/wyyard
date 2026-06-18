from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Any


class ChangedCell(BaseModel):
    rowKey: int
    fields: List[str]

class ActivityHistoryBase(BaseModel):
    date: str                    # "2026-06-18"
    space_id: str
    action: str                  # "编辑了活动" | "新增了活动" | ...
    user_name: str
    ip: str = ""
    rows_snapshot: List[Any]     # ActivityRow[] 的 JSON 快照
    changed_keys: List[int] = []
    changed_cells: List[ChangedCell] = []


class ActivityHistoryCreate(ActivityHistoryBase):
    pass


class ActivityHistory(ActivityHistoryBase):
    id: str
    created_at: datetime
