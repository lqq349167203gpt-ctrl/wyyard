from datetime import datetime
from typing import List, Optional

from pydantic import field_validator

from app.models.payment_course import PaymentCourseFields
from app.utils.payment_types import OH_READING_TYPES


class OhCardReadingBase(PaymentCourseFields):
    customer_id: str
    nickname: str
    reading_type: str = ""  # 旧记录未设置子类时保留为空

    @field_validator("reading_type")
    @classmethod
    def validate_reading_type(cls, value: str) -> str:
        if value and value not in OH_READING_TYPES:
            raise ValueError("请选择有效的OH卡诊断类型")
        return value
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
