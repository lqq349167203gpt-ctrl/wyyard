"""主理人分析口径；日期区间只约束起点，不截断后续转化观察期。"""

from datetime import date
from typing import Literal

from pydantic import Field, model_validator

from app.models.base import StrictBaseModel


class ConversionAction(StrictBaseModel):
    kind: Literal["attendance", "purchase", "coarse_usage"] = "coarse_usage"
    product: str = ""
    subtype: str = ""
    occurrence: Literal["first", "any", "repeat"] = "first"


class ConversionRule(StrictBaseModel):
    name: str = Field(default="粗门初次到场 → 会员卡首购", min_length=1, max_length=80)
    source: ConversionAction = Field(default_factory=ConversionAction)
    targets: list[ConversionAction] = Field(
        default_factory=lambda: [ConversionAction(kind="purchase", product="membership", occurrence="first")],
        min_length=1, max_length=8,
    )
    target_mode: Literal["any", "all"] = "any"
    window_days: int = Field(default=30, ge=0, le=3650)
    same_organization: bool = True


class PrincipalQuery(StrictBaseModel):
    organization_id: str = ""
    date_from: date | None = None
    date_to: date | None = None
    tab: Literal["overview", "courses", "orders", "conversion"] = "overview"
    product: str = ""
    order_filter: Literal["", "first", "repeat", "cross"] = ""
    status: Literal["", "converted", "unconverted", "observing"] = ""
    rule: ConversionRule = Field(default_factory=ConversionRule)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def validate_range(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("开始日期不能晚于结束日期")
        return self
