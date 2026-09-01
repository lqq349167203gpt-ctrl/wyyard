from datetime import datetime
from typing import List, Optional

from app.models.base import SafeBaseModel


class OfflineCourseBase(SafeBaseModel):
    customer_id: str
    nickname: str
    effective_date: str
    validity_value: int = 1
    validity_unit: str = "month"
    amount: float = 0.0
    notes: str = ""
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    closers: List[dict] = []
    payment_method: Optional[str] = None
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None
    created_by: str = ""
    created_by_id: str = ""


class OfflineCourseCreate(OfflineCourseBase):
    pass


class OfflineCourse(OfflineCourseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
