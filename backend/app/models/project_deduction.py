from datetime import datetime
from typing import Optional

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


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
    notes: str = ""
    created_by: str = ""
    updated_by: str = ""
    closer_id: str = ""
    closer_name: str = ""
    closers: list[dict] = []
    organization_id: str = ""
    organization_name: str = ""
    source_activity_type: str = ""
    source_activity_id: str = ""
    source_activity_key: str = ""
    source_activity_name: str = ""
    source_activity_date: str = ""
    source_organization_id: str = ""
    source_organization_name: str = ""
    source_space_id: str = ""
    source_space_name: str = ""


class ProjectDeductionCreate(StrictBaseModel):
    customer_id: str
    project_type: str
    project_id: str
    count: int = Field(default=1, ge=1)
    reason: str = Field(min_length=1, max_length=200)
    notes: str = ""
    created_by: str = ""
    deduction_date: str = ""
    closer_id: str = ""
    closer_name: str = ""
    closers: list[dict] = []
    organization_id: str = ""
    organization_name: str = ""
    source_activity_type: str = ""
    source_activity_id: str = ""
    source_activity_key: str = ""
    source_activity_name: str = ""
    source_activity_date: str = ""
    source_organization_id: str = ""
    source_organization_name: str = ""
    source_space_id: str = ""
    source_space_name: str = ""


class ProjectDeduction(ProjectDeductionBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
