"""陪伴营仅登记购买与有效期，不登记成交金额。"""

from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.models.payment_course import PaymentCourseFields


class CompanionCampCreate(PaymentCourseFields):
    customer_id: str
    nickname: str
    deal_date: str
    organization_id: str
    effective_date: str
    validity_value: int = Field(default=1, ge=1, le=1200)
    validity_unit: Literal["day", "month"] = "month"
    closers: list[dict] = []
    closer_id: str | None = None
    closer_name: str | None = None
    companion_teacher: str
    companion_teacher_id: str = ""
    notes: str = ""
    created_by: str = ""
    created_by_id: str = ""
    amount_recorded: Literal[False] = False

    @field_validator("companion_teacher")
    @classmethod
    def required_teacher(cls, value):
        if not value.strip():
            raise ValueError("请选择陪伴老师")
        return value.strip()

    @field_validator("deal_date", "effective_date")
    @classmethod
    def valid_date(cls, value):
        return date.fromisoformat(value).isoformat()

    @field_validator("organization_id", "customer_id")
    @classmethod
    def required_id(cls, value):
        if not value.strip():
            raise ValueError("请选择用户和成交归属")
        return value


class CompanionCamp(CompanionCampCreate):
    id: str
    expiry_date: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None
