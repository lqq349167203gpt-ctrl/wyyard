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
        # 停用人工跟进阶段；载入旧规则时不再显示或应用这项条件。
        value = [condition for condition in value if condition.field != "follow_up_status"]
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
    scope_type: Literal["organization", "person"] = "organization"
    referrer_id: str = Field(default="", max_length=64)
    organization_id: str = ""
    date_from: date | None = None
    date_to: date | None = None
    tab: Literal["overview", "courses", "orders", "conversion"] = "overview"
    # 成交面板复用本次数据计算经营概况，避免前端另发一份全量查询。
    include_overview: bool = False
    product: str = ""
    # 课程记录：活动类型与沙龙具体课程（仅课程列表生效）
    activity_type: str = ""
    course_subtype: str = ""
    course_view: Literal["course", "participant", "teacher_follow_up"] = "course"
    participant_scope: Literal["", "internal", "external"] = ""
    # 参与者列表：rows＝一人一行；courses＝一堂课一张卡片；旧端不传仍按行展示。
    participant_layout: Literal["rows", "courses"] = "rows"
    # 累计课程明细固定到被点击课程的组织；个人范围仍须校验引流客户归属。
    participant_history_organization_id: str = Field(default="", max_length=64)
    # 邀约二级列表：arrive＝邀约到店口径；initiated＝发起口径（列内容后续再定）
    invite_view: Literal["arrive", "initiated"] = "arrive"
    order_filter: Literal["", "first", "repeat", "cross", "experience", "conversion", "upsell", "repurchase"] = ""
    # 课程列表：只看当日有成交 / 有关联成交的课程（经营概况里点数字筛选）
    course_deal: Literal["", "same_day", "related"] = ""
    status: Literal["", "converted", "unconverted", "observing"] = ""
    # 经营概况展开面板里勾选的二级项目（如 deals:membership / type:沙龙活动 / course:读书会），
    # 只用来筛下面的明细列表，不影响卡片与二级拆分本身的口径
    breakdown: list[str] = Field(default_factory=list, max_length=16)
    # 只看某个客户的记录（列表里点「成交笔数」时用来取这个客户的全部成交）
    customer_id: str = Field(default="", max_length=64)
    # 引流客户导出：ID 仅用于收窄已授权结果及保持页面顺序，不作为数据来源。
    export_view: Literal["", "traffic", "invite_initiated", "invite_arrivals"] = ""
    # 仅指定导出所属卡片；数量必须由服务端按当前权限和筛选计算。
    export_group: Literal["", "traffic", "invite", "participation", "courses", "deals"] = ""
    export_customer_ids: list[str] | None = Field(default=None, max_length=50000)
    export_columns: list[str] | None = Field(default=None, max_length=32)
    # customer＝一人一行；date＝每次到店一行；date_group＝按到店日期成组，供卡片分页
    arrival_view: Literal["customer", "date", "date_group"] = "customer"
    # PC 按需明细：旧端不传时保留完整响应；汇总与明细共用同一分析结果。
    compact_overview: bool = False
    overview_detail: Literal["", "traffic", "invite_arrivals", "invite_initiated", "participation"] = ""
    overview_detail_key: str = Field(default="", max_length=80)
    detail_picks: list[str] = Field(default_factory=list, max_length=16)
    detail_quick_filter: str = Field(default="", max_length=80)
    detail_sort_by: str = Field(default="", max_length=40)
    detail_sort_order: Literal["asc", "desc"] = "asc"
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
    # 管理端小程序按当前经营板块分批取列表；未传裁剪参数的旧客户端保留完整响应。
    mobile_group: Literal["", "traffic", "invite_arrive", "invite_initiated", "participation", "courses", "deals"] = ""
    mobile_quick_filter: str = Field(default="", max_length=80)
    mobile_detail_key: str = Field(default="", max_length=120)

    @field_validator("breakdown", "detail_picks")
    @classmethod
    def normalize_activity_picks(cls, values: list[str]) -> list[str]:
        normalized = []
        for value in values:
            kind, separator, label = value.partition(":")
            if kind in {"type", "course", "participation_type", "participation_course"} and (
                label == "能量结" or label.startswith("能量结｜") or label.startswith("能量结·")
            ):
                label = "深度情绪释放" + label[len("能量结"):]
            normalized.append(kind + separator + label)
        return normalized

    @model_validator(mode="after")
    def validate_range(self):
        if self.participant_history_organization_id and (self.tab != "courses" or self.course_view != "participant" or not self.customer_id or self.participant_layout != "rows"):
            raise ValueError("累计课程明细需要指定用户，并使用课程参与者明细视图")
        if self.scope_type == "person" and (self.organization_id or self.tab == "conversion"):
            raise ValueError("个人范围不能同时选择组织或用于转化分析")
        if self.referrer_id and self.scope_type != "person":
            raise ValueError("请在个人范围下选择引流人")
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("开始日期不能晚于结束日期")
        if self.overview_detail and (self.tab != "overview" or self.mobile_group):
            raise ValueError("按需明细仅用于经营概况，请勿混用小程序列表参数")
        return self
