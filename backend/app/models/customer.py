from datetime import date, datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import Field, field_validator, model_validator

from app.models.base import SafeBaseModel, StrictBaseModel


def _validate_iso_date(value: str) -> str:
    if not value:
        return value
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("引流日期格式不正确") from exc
    if parsed.isoformat() != value:
        raise ValueError("引流日期格式不正确")
    return value


class PaidItem(str, Enum):
    CARD_399 = "399次卡"
    MEMBER_3999 = "3999会员"
    HALF_YEAR = "半年卡"
    HEALER_2W = "2w疗愈师"


class SelfTag(str, Enum):
    SELF_GROWTH = "自我成长"
    CO_CREATE = "共创"
    MONETIZE = "变现"


class FollowUpStatus(str, Enum):
    NEW = "新添加"
    COMMUNICATING = "前期沟通中"
    INVITED_NOT_VISITED = "已邀约未到店"
    VISITED = "已到店"
    CONVERTED = "已成交"
    SILENT_OR_LOST = "沉默/流失"
    UNCONFIGURED = "未配置"


class Position(str, Enum):
    TEACHER = "课程部"
    TRAFFIC = "流量部"
    SERVICE = "承接部"
    AFTERSALES = "售后部"
    ACHIEVER = "成就君"
    MANAGEMENT = "信息管理"
    ENERGY_HOST = "能量结老师"
    COURSE_TEACHER = "课程老师"


class PaidContentItem(SafeBaseModel):
    type: PaidItem
    usage_count: int = 0
    salesperson: str = ""


class CustomerBase(SafeBaseModel):
    nickname: str = Field(default="", max_length=50)
    name: str = Field(default="", max_length=50)
    gender: str = Field(default="", max_length=10)
    phone: str = Field(default="", max_length=20)
    wechat: str = Field(default="", max_length=80)
    age: str = Field(default="", max_length=10)
    service_teacher: str = Field(default="", max_length=50)
    referrer: str = Field(default="", max_length=50)
    referral_date: str = Field(default="", max_length=10)
    referrer_handler: str = Field(default="", max_length=50)
    follow_up_status: FollowUpStatus = FollowUpStatus.UNCONFIGURED
    member_type: str = Field(default="", max_length=50)
    paid_content: List[PaidContentItem] = Field(default=[], max_length=20)
    visit_count: int = Field(default=0, ge=0)
    core_situation: str = Field(default="", max_length=5000)
    need_tags: str = Field(default="", max_length=2000)
    follow_up_node: str = Field(default="", max_length=200)
    follow_up_action: str = Field(default="", max_length=500)
    positions: List[Position] = Field(default=[], max_length=20)
    self_tags: List[SelfTag] = Field(default=[], max_length=10)
    work_status: str = Field(default="", max_length=100)
    work_description: str = Field(default="", max_length=2000)
    basic_info: str = Field(default="", max_length=5000)
    assessment: str = Field(default="", max_length=5000)
    tags: str = Field(default="", max_length=2000)
    other_info: str = Field(default="", max_length=5000)
    traffic_source: str = Field(default="", max_length=100)
    traffic_source_detail: str = Field(default="", max_length=200)
    avatar_url: str = Field(default="", max_length=500)
    tracking_plan: str = Field(default="", max_length=2000)
    position_sort_orders: Dict[str, int] = {}
    space_id: str = Field(default="", max_length=50)
    created_by: str = Field(default="", max_length=50)

    @field_validator("position_sort_orders")
    @classmethod
    def validate_position_sort_orders(cls, v: Dict[str, int]) -> Dict[str, int]:
        if len(v) > 20:
            raise ValueError("排序配置最多 20 项")
        for k in v:
            if len(k) > 50:
                raise ValueError("排序键名过长")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if v and not v.replace("+", "").replace("-", "").replace(" ", "").isdigit():
            raise ValueError("手机号格式不正确")
        return v

    @field_validator("referral_date")
    @classmethod
    def validate_referral_date(cls, v: str) -> str:
        return _validate_iso_date(v)

    @field_validator("follow_up_status", mode="before")
    @classmethod
    def normalize_legacy_follow_up_status(cls, v):
        # 兼容历史数据及尚未更新的旧端；对外统一展示为新名称。
        return FollowUpStatus.COMMUNICATING.value if v == "沟通中" else v

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: str) -> str:
        if v:
            v = v.strip()
            # 提取第一个数字（支持 "31~40"、"32 (31~40)" 等格式）
            import re
            m = re.match(r"(\d+)", v)
            if m:
                age_int = int(m.group(1))
                if age_int < 0 or age_int > 200:
                    raise ValueError("年龄格式不正确")
            else:
                raise ValueError("年龄格式不正确")
        return v


class CustomerCreate(CustomerBase):
    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_nickname_required(self):
        if not self.nickname or not self.nickname.strip():
            raise ValueError("昵称不能为空")
        return self


class CustomerUpdate(StrictBaseModel):

    nickname: Optional[str] = Field(default=None, max_length=50)
    name: Optional[str] = Field(default=None, max_length=50)
    gender: Optional[str] = Field(default=None, max_length=10)
    phone: Optional[str] = Field(default=None, max_length=20)
    wechat: Optional[str] = Field(default=None, max_length=80)
    age: Optional[str] = Field(default=None, max_length=10)
    service_teacher: Optional[str] = Field(default=None, max_length=50)
    referrer: Optional[str] = Field(default=None, max_length=50)
    referral_date: Optional[str] = Field(default=None, max_length=10)
    referrer_handler: Optional[str] = Field(default=None, max_length=50)
    follow_up_status: Optional[FollowUpStatus] = None
    member_type: Optional[str] = Field(default=None, max_length=50)
    paid_content: Optional[List[PaidContentItem]] = Field(default=None, max_length=20)
    visit_count: Optional[int] = Field(default=None, ge=0)
    core_situation: Optional[str] = Field(default=None, max_length=5000)
    need_tags: Optional[str] = Field(default=None, max_length=2000)
    follow_up_node: Optional[str] = Field(default=None, max_length=200)
    follow_up_action: Optional[str] = Field(default=None, max_length=500)
    positions: Optional[List[Position]] = Field(default=None, max_length=20)
    self_tags: Optional[List[SelfTag]] = Field(default=None, max_length=10)
    work_status: Optional[str] = Field(default=None, max_length=100)
    work_description: Optional[str] = Field(default=None, max_length=2000)
    basic_info: Optional[str] = Field(default=None, max_length=5000)
    assessment: Optional[str] = Field(default=None, max_length=5000)
    tags: Optional[str] = Field(default=None, max_length=2000)
    other_info: Optional[str] = Field(default=None, max_length=5000)
    traffic_source: Optional[str] = Field(default=None, max_length=100)
    traffic_source_detail: Optional[str] = Field(default=None, max_length=200)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    tracking_plan: Optional[str] = Field(default=None, max_length=2000)
    position_sort_orders: Optional[Dict[str, int]] = None
    space_id: Optional[str] = Field(default=None, max_length=50)

    @field_validator("nickname")
    @classmethod
    def validate_nickname_not_blank(cls, v: Optional[str]) -> Optional[str]:
        # 若显式传了昵称则不允许空白，防止置空绕过创建时的非空约束（空值也不参与查重）
        if v is not None and not v.strip():
            raise ValueError("昵称不能为空")
        return v

    @field_validator("position_sort_orders")
    @classmethod
    def validate_position_sort_orders(cls, v: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
        if v is not None:
            if len(v) > 20:
                raise ValueError("排序配置最多 20 项")
            for k in v:
                if len(k) > 50:
                    raise ValueError("排序键名过长")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v and not v.replace("+", "").replace("-", "").replace(" ", "").isdigit():
            raise ValueError("手机号格式不正确")
        return v

    @field_validator("referral_date")
    @classmethod
    def validate_referral_date(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_date(v) if v is not None else v

    @field_validator("follow_up_status", mode="before")
    @classmethod
    def normalize_legacy_follow_up_status(cls, v):
        # 兼容尚未更新的旧端提交，保存时统一落为新名称。
        return FollowUpStatus.COMMUNICATING.value if v == "沟通中" else v

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v:
            v = v.strip()
            import re
            m = re.match(r"(\d+)", v)
            if m:
                age_int = int(m.group(1))
                if age_int < 0 or age_int > 200:
                    raise ValueError("年龄格式不正确")
            else:
                raise ValueError("年龄格式不正确")
        return v


class Customer(CustomerBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None


class ChatLogParseRequest(StrictBaseModel):
    chat_log: str = Field(max_length=50000)
