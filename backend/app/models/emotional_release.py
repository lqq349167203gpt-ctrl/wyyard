from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class EmotionalReleaseBase(BaseModel):
    customer_id: str
    nickname: str
    purchase_count: int = 0
    amount: float = 0.0
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    organization_id: Optional[str] = None


class EmotionalReleaseCreate(EmotionalReleaseBase):
    pass


class EmotionalRelease(EmotionalReleaseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
