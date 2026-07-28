from datetime import datetime
from typing import List, Optional

from pydantic import Field

from app.models.base import SafeBaseModel


class EnergyKnotSessionBase(SafeBaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    owner_id: str  # 案主
    owner_name: str
    name: str = ""  # 活动名称
    description: Optional[str] = None  # 个案详情（JSON 格式）
    course_description: str = ""  # 小程序端活动简介
    participant_ids: List[str] = []  # 参与者
    teacher_ids: List[str] = []  # 老师（多选）
    host_id: str = ""  # 主持人
    host_name: str = ""
    is_published: bool = False
    activity_mode: str = "线下"
    membership_deduction_count: int = Field(default=1, ge=0)
    space_id: str = ""
    room_id: str = ""
    room_name: str = ""
    space_name: str = ""


class EnergyKnotSessionCreate(EnergyKnotSessionBase):
    pass


class EnergyKnotSession(EnergyKnotSessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
