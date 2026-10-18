from datetime import datetime
from typing import List, Optional

from pydantic import field_validator

from app.models.payment_course import PaymentCourseFields
from app.utils.payment_types import OFFLINE_COURSE_TYPES


class OfflineCourseBase(PaymentCourseFields):
    course_type: str = ""  # 旧订单未记录类型时保持空白，不推测历史类型。
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

    @field_validator("course_type")
    @classmethod
    def validate_course_type(cls, value):
        if value and value not in OFFLINE_COURSE_TYPES:
            raise ValueError("请选择有效的线下落地课程类型")
        return value


class OfflineCourseCreate(OfflineCourseBase):
    pass


class OfflineCourse(OfflineCourseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
