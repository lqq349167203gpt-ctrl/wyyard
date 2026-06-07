from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class OtherProjectDeductionBase(BaseModel):
    customer_id: str
    nickname: str
    other_project_id: str
    project_name: str
    activity_mode: str
    project_created_at: str
    count: int = 1
    deduction_date: str  # YYYY-MM-DD
    remaining_after: int


class OtherProjectDeductionCreate(BaseModel):
    customer_id: str
    other_project_id: str
    count: int = 1


class OtherProjectDeduction(OtherProjectDeductionBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
