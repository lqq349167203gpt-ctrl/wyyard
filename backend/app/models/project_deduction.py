from pydantic import BaseModel
from datetime import datetime


class ProjectDeductionBase(BaseModel):
    customer_id: str
    nickname: str
    project_type: str  # membership-cards / group-cases / emotional-releases / oh-card-readings / energy-knots
    project_id: str
    project_name: str
    count: int = 1
    deduction_date: str  # YYYY-MM-DD
    remaining_after: int


class ProjectDeductionCreate(BaseModel):
    customer_id: str
    project_type: str
    project_id: str
    count: int = 1


class ProjectDeduction(ProjectDeductionBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
