from datetime import datetime
from typing import List, Optional

from app.models.base import SafeBaseModel


class OhCardReadingBase(SafeBaseModel):
    customer_id: str
    nickname: str
    purchase_count: int = 1  # 固定为1，录入即完成
    diagnosis_duration: int = 1  # 诊断时长（半小时为单位），默认1=0.5小时
    amount: float = 298.0  # 默认298
    notes: str = ""  # 注释
    diagnosis_teacher: str = ""  # 诊断老师（昵称）
    closer_id: Optional[str] = None
    closer_name: Optional[str] = None
    closers: List[dict] = []
    payment_method: Optional[str] = None  # 支付宝 / 微信 / 其他
    organization_id: Optional[str] = None
    deal_date: Optional[str] = None
    created_by: str = ""
    created_by_id: str = ""


class OhCardReadingCreate(OhCardReadingBase):
    pass


class OhCardReading(OhCardReadingBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
