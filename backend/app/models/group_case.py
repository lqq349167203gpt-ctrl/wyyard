from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class GroupCaseBase(BaseModel):
    customer_id: str
    nickname: str
    purchase_count: int = 0
    amount: float = 0.0
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    closers: List[dict] = []
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None


class GroupCaseCreate(GroupCaseBase):
    pass


class GroupCase(GroupCaseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
