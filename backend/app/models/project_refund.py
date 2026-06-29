from pydantic import BaseModel
from datetime import datetime


class ProjectRefundBase(BaseModel):
    customer_id: str
    nickname: str
    project_type: str  # membership-cards / group-cases / emotional-releases / oh-card-readings / energy-knots / other-projects
    project_id: str
    project_name: str
    paid_amount: float = 0  # 已付金额
    refund_amount: float = 0  # 退费金额
    refund_date: str  # YYYY-MM-DD
    operator_name: str = ""


class ProjectRefundCreate(BaseModel):
    customer_id: str
    project_type: str
    project_id: str
    refund_amount: float = 0
    operator_name: str = ""


class ProjectRefund(ProjectRefundBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
