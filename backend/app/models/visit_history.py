from app.models.base import SafeBaseModel
from datetime import datetime
from typing import List, Any


class VisitChangedCell(SafeBaseModel):
    rowKey: int
    fields: List[str]


class VisitHistoryBase(SafeBaseModel):
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
