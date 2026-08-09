from datetime import datetime

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class ExpenseFields(StrictBaseModel):
    expense_time: str = Field(min_length=1, max_length=32)
    purchase_content: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=100_000_000)
    platform: str = Field(min_length=1, max_length=100)
    notes: str = Field(default="", max_length=2000)


class ExpenseCreate(ExpenseFields):
    pass


class ExpenseUpdate(ExpenseFields):
    pass


class Expense(SafeBaseModel):
    id: str
    expense_time: str
    purchase_content: str
    amount: float
    platform: str
    notes: str = ""
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None
