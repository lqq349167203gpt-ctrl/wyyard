from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class MembershipCardBase(BaseModel):
    customer_id: str
    nickname: str
    card_type: str  # 体验会员 / 常规通卡 / 半年卡 / 年卡
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
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None
    created_by: str = ""


class MembershipCardCreate(MembershipCardBase):
    pass


class MembershipCard(MembershipCardBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
