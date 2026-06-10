from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class InternalCourseBase(BaseModel):
    customer_id: str
    nickname: str
    course_type: str
    price: float
    effective_date: str
    expiry_date: Optional[str] = None
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    organization_id: Optional[str] = None


class InternalCourseCreate(InternalCourseBase):
    pass


class InternalCourse(InternalCourseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
