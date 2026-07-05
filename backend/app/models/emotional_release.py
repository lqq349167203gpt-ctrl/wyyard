from app.models.base import SafeBaseModel
from datetime import datetime
from typing import List, Optional


class EmotionalReleaseBase(SafeBaseModel):
    customer_id: str
    nickname: str
    purchase_count: int = 0
    amount: float = 0.0
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    closers: List[dict] = []
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None
    created_by: str = ""


class EmotionalReleaseCreate(EmotionalReleaseBase):
    pass


class EmotionalRelease(EmotionalReleaseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
