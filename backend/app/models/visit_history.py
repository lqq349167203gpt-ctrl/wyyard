from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Any


class VisitChangedCell(BaseModel):
    rowKey: int
    fields: List[str]


class VisitHistoryBase(BaseModel):
    date: str
    space_id: str = ""
    action: str
    user_name: str
    ip: str = ""
    rows_snapshot: List[Any]
    changed_keys: List[int] = []
    changed_cells: List[VisitChangedCell] = []


class VisitHistoryCreate(VisitHistoryBase):
    pass


class VisitHistory(VisitHistoryBase):
    id: str
    created_at: datetime
