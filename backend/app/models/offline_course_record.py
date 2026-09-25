from datetime import datetime
from typing import Optional

from pydantic import Field

from .base import SafeBaseModel


class OfflineCourseRecordBase(SafeBaseModel):
    course_name: str = ""
    course_type: str = ""
    participant_ids: list[str] = Field(default_factory=list)
    participant_names: list[str] = Field(default_factory=list)
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
