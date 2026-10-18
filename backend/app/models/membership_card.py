from datetime import datetime
from typing import List, Literal, Optional

from pydantic import field_validator

from app.models.payment_course import PaymentCourseFields
from app.utils.payment_types import normalize_card_type


class MembershipCardBase(PaymentCourseFields):
    customer_id: str
    nickname: str
    card_type: str  # 次卡 / 体验会员 / 30次卡 / 60次卡 / 定制化（粗门保持独立）
    price: float
    effective_date: str  # YYYY-MM-DD
    duration_type: Optional[str] = None  # day / month / null
    duration_value: Optional[int] = None  # 时长数值
    total_count: Optional[int] = None  # 总购买次数（null 表示不限次）
    remaining_count: Optional[int] = None  # 剩余次数（null 表示不限次）
    expiry_date: Optional[str] = None  # 到期日期（自动计算）
    closer_id: Optional[str] = None  # 成交人ID（旧字段，兼容）
    closer_name: Optional[str] = None  # 成交人昵称（旧字段，兼容）
    closers: List[dict] = []  # 多成交人 [{"id": "xxx", "name": "张三", "amount": 100.0}]
    agreement_status: Optional[Literal["unsigned", "signed"]] = None  # 旧记录未填按未签处理
    payment_method: Optional[str] = None  # 支付宝 / 微信 / 其他
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None
    notes: str = ""  # 注释
    created_by: str = ""
    created_by_id: str = ""

    @field_validator("card_type", mode="before")
    @classmethod
    def normalize_type(cls, value):
        return normalize_card_type(value)


class MembershipCardCreate(MembershipCardBase):
    pass


class MembershipCard(MembershipCardBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    voided: bool = False  # 退费作废标记（退费后卡不可再使用，但保留记录）
    voided_at: Optional[datetime] = None  # 作废时间
