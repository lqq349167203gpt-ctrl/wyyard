from datetime import datetime

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class CommissionFields(StrictBaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    person_id: str = Field(default="", max_length=100)
    person_name: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0, le=100_000_000)
    notes: str = Field(default="", max_length=2000)


class CommissionCreate(CommissionFields):
    pass


class Commission(CommissionFields, SafeBaseModel):
    id: str
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False


class StaffBenefitFields(StrictBaseModel):
    benefit_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    content: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=100_000_000)
    notes: str = Field(default="", max_length=2000)


class StaffBenefitCreate(StaffBenefitFields):
    pass


class StaffBenefit(StaffBenefitFields, SafeBaseModel):
    id: str
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
