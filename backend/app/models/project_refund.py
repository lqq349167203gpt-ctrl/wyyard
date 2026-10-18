from datetime import datetime

from pydantic import model_validator

from app.models.base import SafeBaseModel, StrictBaseModel
from app.utils.payment_types import normalize_card_type


class ProjectRefundBase(SafeBaseModel):
    customer_id: str
    nickname: str
    project_type: str  # membership-cards / group-cases / emotional-releases / oh-card-readings / energy-knots / other-projects
    project_id: str
    project_name: str
    paid_amount: float = 0  # 已付金额
    refund_amount: float = 0  # 退费金额
    refund_date: str  # YYYY-MM-DD
    created_by: str = ""
    updated_by: str = ""

    @model_validator(mode="after")
    def normalize_card_name(self):
        if self.project_type == "membership-cards" and self.project_name and self.project_name != "会员卡":
            self.project_name = normalize_card_type(self.project_name)
        return self


class ProjectRefundCreate(StrictBaseModel):
    customer_id: str
    project_type: str
    project_id: str
    refund_amount: float = 0
    created_by: str = ""


class ProjectRefund(ProjectRefundBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
