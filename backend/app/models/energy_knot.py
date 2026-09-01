from datetime import datetime
from typing import List, Optional

from app.models.base import SafeBaseModel


class EnergyKnotBase(SafeBaseModel):
    customer_id: str
    nickname: str
    purchase_count: int = 0
    amount: float = 0.0
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    closers: List[dict] = []
    payment_method: Optional[str] = None  # 支付宝 / 微信 / 其他
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: str = ""  # 注释
    created_by: str = ""
    created_by_id: str = ""


class EnergyKnotCreate(EnergyKnotBase):
    pass


class EnergyKnot(EnergyKnotBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
