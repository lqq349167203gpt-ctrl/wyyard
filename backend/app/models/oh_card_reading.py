from app.models.base import SafeBaseModel
from datetime import datetime
from typing import Optional, List


class OhCardReadingBase(SafeBaseModel):
    customer_id: str
    nickname: str
    purchase_count: int = 0
    amount: float = 0.0
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    closers: List[dict] = []
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None


class OhCardReadingCreate(OhCardReadingBase):
    pass


class OhCardReading(OhCardReadingBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
