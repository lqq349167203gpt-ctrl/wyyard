from app.models.base import SafeBaseModel, StrictBaseModel
from datetime import datetime
from typing import Optional


class ActivityRegistrationCreate(StrictBaseModel):
    activity_type: str  # class_record / gcs / ers / eks / ics / ocr
    activity_id: str
    activity_name: str
    activity_date: str


class ActivityRegistration(SafeBaseModel):
    id: str
    customer_id: str
    nickname: str
    activity_type: str
    activity_id: str
    activity_name: str
    activity_date: str
    status: str = "pending"  # pending / confirmed / cancelled
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_deleted: bool = False
