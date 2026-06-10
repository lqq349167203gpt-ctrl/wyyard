from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class OtherProjectBase(BaseModel):
    customer_id: str
    nickname: str
    project_name: str  # 项目名称
    fee: float = 0  # 费用
    activity_mode: str = "线下"  # 线上 / 线下
    effective_date: str  # YYYY-MM-DD
    duration_type: Optional[str] = None  # day / month / null
    duration_value: Optional[int] = None  # 时长数值
    remaining_count: Optional[int] = None  # 剩余次数（null 表示不限）
    expiry_date: Optional[str] = None  # 到期日期（自动计算）
    closer_id: Optional[str] = None  # 成交人ID
    closer_name: Optional[str] = None  # 成交人昵称
    organization_id: Optional[str] = None


class OtherProjectCreate(OtherProjectBase):
    pass


class OtherProject(OtherProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
