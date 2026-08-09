from datetime import datetime
from typing import Optional
from .base import SafeBaseModel


class OfflineCourseRecordBase(SafeBaseModel):
    customer_id: str = ""
    customer_nickname: str = ""
    record_date: str = ""
    teacher: str = ""
    content: str = ""
    result: str = ""


class OfflineCourseRecordCreate(OfflineCourseRecordBase):
    pass


class OfflineCourseRecord(OfflineCourseRecordBase):
    id: str
    creator: str = ""
    created_at: datetime
    updated_at: Optional[datetime] = None
