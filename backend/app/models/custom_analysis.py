from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import Field, field_validator, model_validator

from app.models.base import StrictBaseModel
from app.utils.payment_types import normalize_card_type

AnalysisField = Literal[
    "nickname",
    "name",
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
    "created_at",
    "invitation_dates",
    "invitation_created_dates",
    "first_visit_date",
    "last_visit_date",
    "invitation_count",
    "visit_count",
    "activity_count",
    "activity_types",
    "activity_names",
    "course_teachers",
    "communication_count",
    "last_communication_date",
    "total_consumption",
    "purchased_projects",
    "created_by",
    "inviter_names",
    "invitation_creators",
    "schedule_creators",
    "invitation_count_period",
    "visit_count_period",
    "cancelled_count_period",
    "activity_count_period",
    "payment_categories",
    "payment_projects",
    "payment_closers",
    "payment_methods",
    "payment_count_period",
    "payment_amount_period",
    "payment_dates",
    "latest_payment_date",
    "visit_purpose",
    "trauma_history",
    "current_block",
    "work_info",
    "other_info",
]

AnalysisOperator = Literal[
    "eq",
    "ne",
    "contains",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "is_empty",
    "is_not_empty",
    "is_weekday",
    "is_weekend",
]

CardDimension = Literal[
    "none",
    "invitation_day_type",
    "gender",
    "follow_up_status",
    "member_type",
    "customer_tags",
    "traffic_source",
    "referrer",
    "referrer_handler",
    "service_teacher",
    "inviter_names",
    "activity_types",
    "purchased_projects",
]

AnalysisMetric = Literal[
    "total_customers",
    "created_customers",
    "referred_customers",
    "invited_customers",
    "invitation_visits",
    "cancelled_customers",
    "cancelled_visits",
    "arrived_customers",
    "arrival_visits",
    "activity_customers",
    "activity_participations",
    "converted_customers",
    "payment_orders",
    "payment_amount",
]

RowDisplayMode = Literal[
    "unique_customers",
    "arrival_visits",
    "activity_participations",
]

INHERITABLE_DATE_FIELDS = {
    "referral_date",
    "created_at",
    "invitation_dates",
    "invitation_created_dates",
    "first_visit_date",
    "last_visit_date",
    "last_communication_date",
    "payment_dates",
    "latest_payment_date",
}

DAY_TYPE_OPERATORS = {"is_weekday", "is_weekend"}
VALUELESS_OPERATORS = {"is_empty", "is_not_empty", *DAY_TYPE_OPERATORS}


def _normalize_filter_label(value: Any, field: str, operator: str) -> Any:
    """旧模板只转换有明确分类含义的值，不修改原始存储和用户的模糊搜索词。"""
    if isinstance(value, str) and field == "activity_names" and (value == "能量结" or value.startswith("能量结·")):
        return "深度情绪释放" + value[len("能量结"):]
    if not isinstance(value, str) or field not in {"activity_types", "payment_categories", "purchased_projects"}:
        return value
    if value == "能量结" or value.startswith("能量结·"):
        value = "深度情绪释放" + value[len("能量结"):]
    if value == "内部课程" or value.startswith("内部课程·"):
        value = "沙龙技能学习" + value[len("内部课程"):]
    # OH卡梳理仍是活动类型；只有付费分类的旧名称改为OH卡诊断。
    if field in {"payment_categories", "purchased_projects"} and (
        value == "OH卡梳理" or value.startswith("OH卡梳理·")
    ):
        value = "OH卡诊断" + value[len("OH卡梳理"):]
    if field == "purchased_projects" and operator in {"eq", "ne", "in"} and value.startswith("会员卡·"):
        card_type = value[len("会员卡·"):]
        if card_type:
            value = f"会员卡·{normalize_card_type(card_type)}"
    return value


class AnalysisCondition(StrictBaseModel):
    field: AnalysisField
    operator: AnalysisOperator
    value: Any = None

    inherit_period: bool = False

    @model_validator(mode="after")
    def validate_value(self):
        if self.inherit_period:
            if self.field not in INHERITABLE_DATE_FIELDS:
                raise ValueError("仅日期条件可跟随统计周期")
            self.operator = "between"
            self.value = None
            return self
        if self.operator in DAY_TYPE_OPERATORS and self.field not in INHERITABLE_DATE_FIELDS:
            raise ValueError("工作日和双休日筛选仅支持日期字段")
        if self.operator in VALUELESS_OPERATORS:
            self.value = None
        elif self.operator == "between":
            if not isinstance(self.value, list) or len(self.value) != 2:
                raise ValueError("区间条件必须包含两个值")
        elif self.operator == "in":
            if isinstance(self.value, str):
                self.value = [item.strip() for item in self.value.split(",") if item.strip()]
            if not isinstance(self.value, list):
                self.value = []
        if isinstance(self.value, list):
            self.value = [_normalize_filter_label(item, self.field, self.operator) for item in self.value]
        else:
            self.value = _normalize_filter_label(self.value, self.field, self.operator)
        # 没填完的条件不再报错：查询时会被忽略（页面已经会提示当前模式里没填的条件），
        # 否则另一种模式里遗留的空条件会让整个查询失败。
        return self


class AnalysisComparisonGroup(StrictBaseModel):
    id: str = Field(default="", max_length=40)
    name: str = Field(min_length=1, max_length=24)
    conditions: list[AnalysisCondition] = Field(default_factory=list, max_length=20)
    condition_logic: Literal["all", "any"] = "all"
    date_from: str = ""
    date_to: str = ""

    @field_validator("id", "name")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_date_range(self):
        parsed_from = date.fromisoformat(self.date_from) if self.date_from else None
        parsed_to = date.fromisoformat(self.date_to) if self.date_to else None
        if parsed_from and parsed_to and parsed_from > parsed_to:
            raise ValueError(f"对比组“{self.name}”的开始日期不能晚于结束日期")
        return self


class AnalysisPlan(StrictBaseModel):
    title: str = Field(default="自定义筛选结果", min_length=1, max_length=40)
    total_card_title: str = Field(default="符合条件", min_length=1, max_length=20)
    conditions: list[AnalysisCondition] = Field(default_factory=list, max_length=20)
    condition_logic: Literal["all", "any"] = "all"
    date_from: str = ""
    date_to: str = ""
    metrics: list[AnalysisMetric] = Field(default_factory=lambda: ["total_customers"], min_length=1, max_length=14)
    card_metric: AnalysisMetric = "total_customers"
    card_dimension: CardDimension = "follow_up_status"
    columns: list[AnalysisField] = Field(
        default_factory=lambda: [
            "nickname",
            "member_type",
            "follow_up_status",
            "traffic_source",
            "referrer",
            "visit_count",
            "activity_count",
            "total_consumption",
        ],
        min_length=1,
        max_length=15,
    )
    sort_by: AnalysisField = "referral_date"
    sort_order: Literal["asc", "desc"] = "desc"
    row_display_mode: RowDisplayMode = "unique_customers"
    analysis_mode: Literal["single", "comparison"] = "single"
    comparison_groups: list[AnalysisComparisonGroup] = Field(default_factory=list, max_length=4)

    @field_validator("title", "total_card_title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @field_validator("columns")
    @classmethod
    def normalize_columns(cls, columns: list[AnalysisField]) -> list[AnalysisField]:
        result: list[AnalysisField] = []
        for field in columns:
            if field not in result:
                result.append(field)
        if "nickname" not in result:
            result.insert(0, "nickname")
        return result[:15]

    @field_validator("metrics")
    @classmethod
    def normalize_metrics(cls, metrics: list[AnalysisMetric]) -> list[AnalysisMetric]:
        return list(dict.fromkeys(metrics))

    @model_validator(mode="after")
    def validate_date_range(self):
        parsed_from = date.fromisoformat(self.date_from) if self.date_from else None
        parsed_to = date.fromisoformat(self.date_to) if self.date_to else None
        if parsed_from and parsed_to and parsed_from > parsed_to:
            raise ValueError("开始日期不能晚于结束日期")
        if self.analysis_mode == "comparison" and len(self.comparison_groups) < 2:
            raise ValueError("方案对比至少需要两个对比组")
        # 旧模板也走同一规则：不兼容的拆分指标回到不拆分，避免载入失败。
        if self.card_dimension == "invitation_day_type" and self.card_metric not in {"arrived_customers", "arrival_visits"}:
            self.card_dimension = "none"
        return self


class AnalysisParseRequest(StrictBaseModel):
    query: str = Field(min_length=2, max_length=1000)

    @field_validator("query")
    @classmethod
    def strip_query(cls, value: str) -> str:
        return value.strip()


class AnalysisExecuteRequest(StrictBaseModel):
    plan: AnalysisPlan
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class AnalysisTemplateCreate(StrictBaseModel):
    name: str = Field(min_length=1, max_length=30)
    description: str = Field(default="", max_length=200)
    scope: Literal["private", "shared"] = "private"
    plan: AnalysisPlan

    @field_validator("name", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class AnalysisTemplateUpdate(StrictBaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=30)
    description: Optional[str] = Field(default=None, max_length=200)
    scope: Optional[Literal["private", "shared"]] = None
    plan: Optional[AnalysisPlan] = None

    @field_validator("name", "description")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else None


class AnalysisTemplate(StrictBaseModel):
    id: str
    name: str
    description: str = ""
    scope: Literal["private", "shared"] = "private"
    plan: AnalysisPlan
    created_by_id: str
    created_by_name: str
    use_count: int = 0
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
