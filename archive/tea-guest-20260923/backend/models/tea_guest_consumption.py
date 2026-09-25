from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.models.base import SafeBaseModel, StrictBaseModel

PaymentMethod = Literal["美团", "支付宝", "微信", "抖音"]


class TeaGuestConsumptionFields(StrictBaseModel):
    consumption_time: str = Field(min_length=1, max_length=32)
    guest_count: int = Field(gt=0, le=100_000)
    unit_price: float = Field(gt=0, le=100_000_000)
    payment_method: PaymentMethod
    notes: str = Field(default="", max_length=2000)

    @field_validator("consumption_time")
    @classmethod
    def validate_consumption_time(cls, value: str) -> str:
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("消费时间格式不正确") from error
        return value


class TeaGuestConsumptionCreate(TeaGuestConsumptionFields):
    pass


class TeaGuestConsumptionUpdate(TeaGuestConsumptionFields):
    pass


class TeaGuestConsumption(SafeBaseModel):
    id: str
    consumption_time: str
    guest_count: int
    unit_price: float
    total_amount: float
    payment_method: PaymentMethod
    notes: str = ""
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None
