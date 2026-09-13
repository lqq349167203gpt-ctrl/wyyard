"""主理人分析口径；日期区间只约束起点，不截断后续转化观察期。"""

import re
from datetime import date
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.models.base import StrictBaseModel
from app.models.custom_analysis import AnalysisCondition

# 转化分析可加的条件字段：第一批只开放「客户信息」组（下拉方式/规则与自定义筛选一致），顺序即界面顺序
CONDITION_FIELD_ORDER = (
    "gender",
    "age",
    "member_type",
    "follow_up_status",
    "customer_tags",
    "traffic_source",
    "referrer",
    "referrer_handler",
    "service_teacher",
    "referral_date",
    "invitation_dates",
)
CONDITION_FIELDS = set(CONDITION_FIELD_ORDER)
class ConversionAction(StrictBaseModel):
    kind: Literal["attendance", "purchase", "coarse_usage"] = "coarse_usage"
    product: str = ""
    subtype: str = ""
    occurrence: Literal["first", "any", "repeat"] = "first"
    conditions: list[AnalysisCondition] = Field(default_factory=list, max_length=8)

    @field_validator("conditions")
    @classmethod
    def validate_conditions(cls, value: list[AnalysisCondition]) -> list[AnalysisCondition]:
        for condition in value:
            if condition.field not in CONDITION_FIELDS:
                raise ValueError(f"转化分析暂不支持「{condition.field}」条件")
            if condition.inherit_period:
                raise ValueError("转化分析的条件不支持跟随统计周期")
        return value


class ConversionRule(StrictBaseModel):
    name: str = Field(default="粗门初次到场 → 会员卡首购", min_length=1, max_length=80)
    # 保存规则时使用：说明与可见范围不影响计算口径
    description: str = Field(default="", max_length=200)
    scope: Literal["private", "shared"] = "private"
    source: ConversionAction = Field(default_factory=ConversionAction)
    targets: list[ConversionAction] = Field(
        default_factory=lambda: [ConversionAction(kind="purchase", product="membership", occurrence="first")],
        min_length=1, max_length=8,
    )
    target_mode: Literal["any", "all"] = "any"
    window_days: int = Field(default=30, ge=0, le=3650)
    same_organization: bool = True
    # 保存规则时一并记住当时的筛选范围（组织/俱乐部 + 统计周期）
    organization_id: str = Field(default="", max_length=64)
    date_from: str = Field(default="", max_length=10)
    date_to: str = Field(default="", max_length=10)

    @field_validator("date_from", "date_to", mode="before")
    @classmethod
    def valid_date_text(cls, value):
        text = str(value or "").strip()
        if text and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            raise ValueError("日期格式应为 YYYY-MM-DD")
        return text

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_condition_sides(self):
        # 筛选条件只加在「从」上：客户条件筛人，加一次就够，避免两边重复配置
        if any(target.conditions for target in self.targets):
            raise ValueError("筛选条件请加在「从」上，「到」只填什么算转化")
        return self


class PrincipalQuery(StrictBaseModel):
    organization_id: str = ""
    date_from: date | None = None
    date_to: date | None = None
    tab: Literal["overview", "courses", "orders", "conversion"] = "overview"
    product: str = ""
    # 课程记录：活动类型与沙龙具体课程（仅课程列表生效）
    activity_type: str = ""
    course_subtype: str = ""
    course_view: Literal["course", "participant"] = "course"
    participant_scope: Literal["", "internal", "external"] = ""
    order_filter: Literal["", "first", "repeat", "cross"] = ""
    # 课程列表：只看当日有成交 / 有关联成交的课程（经营概况里点数字筛选）
    course_deal: Literal["", "same_day", "related"] = ""
    status: Literal["", "converted", "unconverted", "observing"] = ""
    # 经营概况展开面板里勾选的二级项目（如 deals:membership / type:沙龙活动 / course:读书会），
    # 只用来筛下面的明细列表，不影响卡片与二级拆分本身的口径
    breakdown: list[str] = Field(default_factory=list, max_length=16)
    # 只看某个客户的记录（列表里点「成交笔数」时用来取这个客户的全部成交）
    customer_id: str = Field(default="", max_length=64)
    # 引流客户导出：ID 仅用于收窄已授权结果及保持页面顺序，不作为数据来源。
    export_view: Literal["", "traffic"] = ""
    export_customer_ids: list[str] | None = Field(default=None, max_length=50000)
    # 只有使用者主动点「查询」时才记分析日志；切 tab、翻页这类自动请求不记，避免刷屏
    log_analysis: bool = False
    # 交易列表的展示口径：order＝每笔交易一行；customer＝同一人只显示一行（合并）
    list_view: Literal["order", "customer"] = "order"
    # 排序整批数据（不是只排当前页），字段名用列的 key
    sort_by: str = Field(default="", max_length=40)
    sort_order: Literal["asc", "desc"] = "asc"
    rule: ConversionRule = Field(default_factory=ConversionRule)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=1000)

    @model_validator(mode="after")
    def validate_range(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("开始日期不能晚于结束日期")
        return self
