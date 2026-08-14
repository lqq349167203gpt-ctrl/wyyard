from datetime import datetime

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class ExpenseFields(StrictBaseModel):
    cost_category: str = Field(default="", pattern="^(|management|operation)$")
    expense_type: str = Field(default="", max_length=100)
    expense_time: str = Field(min_length=1, max_length=32)
    purchase_content: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=100_000_000)
    customer_id: str = Field(default="", max_length=100)
    customer_nickname: str = Field(default="", max_length=100)
    platform: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=2000)


class ExpenseCreate(ExpenseFields):
    pass


class ExpenseUpdate(ExpenseFields):
    pass


class Expense(SafeBaseModel):
    id: str
    expense_time: str
    cost_category: str = ""
    expense_type: str = ""
    purchase_content: str
    amount: float
    customer_id: str = ""
    customer_nickname: str = ""
    platform: str = ""
    notes: str = ""
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None


class ExpenseTypeCreate(StrictBaseModel):
    cost_category: str = Field(pattern="^(management|operation)$")
    name: str = Field(min_length=1, max_length=100)
    requires_customer: bool = False
    requires_platform: bool = False


class ExpenseTypeUpdate(StrictBaseModel):
    requires_customer: bool
    requires_platform: bool


class ExpenseType(SafeBaseModel):
    id: str
    cost_category: str
    name: str
    # 旧类型创建时平台为必填；默认值保证历史配置升级后仍保持原有录入规则。
    requires_customer: bool = False
    requires_platform: bool = True
    created_at: datetime
