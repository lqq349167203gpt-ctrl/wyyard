from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class EnergyKnotSessionBase(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    owner_id: str  # 案主
    owner_name: str
    description: Optional[str] = None  # 个案详情（JSON 格式）
    participant_ids: List[str] = []  # 参与者
    host_ids: List[str] = []  # 课程老师（多选）
    host_names: List[str] = []
    activity_mode: str = "线下"
    space_id: str = ""
    room_id: str = ""


class EnergyKnotSessionCreate(EnergyKnotSessionBase):
    pass


class EnergyKnotSession(EnergyKnotSessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
