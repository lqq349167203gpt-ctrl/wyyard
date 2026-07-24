from app.models.base import SafeBaseModel, StrictBaseModel
from pydantic import Field
from datetime import datetime
from typing import Optional


class ProjectDeductionBase(SafeBaseModel):
    customer_id: str
    nickname: str
    project_type: str  # membership-cards / group-cases / emotional-releases / oh-card-readings / energy-knots / other-projects
    project_id: str
    project_name: str
    count: int = Field(default=1, ge=1)
    deduction_date: str  # YYYY-MM-DD
    remaining_after: Optional[int] = None
    reason: str = ""
    created_by: str = ""
    updated_by: str = ""


class ProjectDeductionCreate(StrictBaseModel):
    customer_id: str
    project_type: str
    project_id: str
    count: int = Field(default=1, ge=1)
    reason: str = Field(min_length=1, max_length=200)
    created_by: str = ""


class ProjectDeduction(ProjectDeductionBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
