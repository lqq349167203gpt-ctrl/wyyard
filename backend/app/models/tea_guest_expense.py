from datetime import datetime

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class TeaGuestExpenseFields(StrictBaseModel):
    cost_category: str = Field(pattern="^(management|operation)$")
    expense_type: str = Field(min_length=1, max_length=100)
    expense_time: str = Field(min_length=1, max_length=32)
    purchase_content: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=100_000_000)
    platform: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=2000)


class TeaGuestExpenseCreate(TeaGuestExpenseFields):
    pass


class TeaGuestExpenseUpdate(TeaGuestExpenseFields):
    pass


class TeaGuestExpense(SafeBaseModel):
    id: str
    cost_category: str
    expense_type: str
    expense_time: str
    purchase_content: str
    amount: float
    platform: str = ""
    notes: str = ""
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None


class TeaGuestExpenseTypeCreate(StrictBaseModel):
    cost_category: str = Field(pattern="^(management|operation)$")
    name: str = Field(min_length=1, max_length=100)
    requires_platform: bool = False


class TeaGuestExpenseTypeUpdate(StrictBaseModel):
    requires_platform: bool


class TeaGuestExpenseType(SafeBaseModel):
    id: str
    cost_category: str
    name: str
    requires_platform: bool = False
    created_at: datetime
