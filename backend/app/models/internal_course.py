from datetime import datetime
from typing import List, Optional

from app.models.payment_course import PaymentCourseFields


class InternalCourseBase(PaymentCourseFields):
    customer_id: str
    nickname: str
    course_type: str
    price: float
    effective_date: str
    validity_value: Optional[int] = None  # 有效期月数；历史记录为空时仍以到期日为准
    expiry_date: Optional[str] = None
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    closers: List[dict] = []
    payment_method: Optional[str] = None  # 支付宝 / 微信 / 其他
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None
    notes: str = ""  # 注释
    created_by: str = ""
    created_by_id: str = ""


class InternalCourseCreate(InternalCourseBase):
    pass


class InternalCourse(InternalCourseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
