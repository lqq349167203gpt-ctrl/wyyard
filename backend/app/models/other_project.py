from app.models.base import SafeBaseModel
from datetime import datetime
from typing import List, Optional


class OtherProjectBase(SafeBaseModel):
    customer_id: str
    nickname: str
    category: Optional[str] = None  # 二级类目
    project_name: str  # 项目名称
    fee: float = 0  # 费用
    activity_mode: str = "线下"  # 线上 / 线下
    effective_date: str  # YYYY-MM-DD
    duration_type: Optional[str] = None  # day / month / null
    duration_value: Optional[int] = None  # 时长数值
    remaining_count: Optional[int] = None  # 剩余次数（null 表示不限）
    expiry_date: Optional[str] = None  # 到期日期（自动计算）
    closer_id: Optional[str] = None  # 成交人ID（旧字段，兼容）
    closer_name: Optional[str] = None  # 成交人昵称（旧字段，兼容）
    closers: List[dict] = []  # 多成交人 [{"id": "xxx", "name": "张三", "amount": 100.0}]
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None


class OtherProjectCreate(OtherProjectBase):
    pass


class OtherProject(OtherProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
