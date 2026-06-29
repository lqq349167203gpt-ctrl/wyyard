from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class EmotionalReleaseSessionBase(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    name: str = ""  # 活动名称
    owner_id: str  # 案主
    owner_name: str
    participant_ids: List[str] = []  # 参与者
    teacher_ids: List[str] = []  # 老师
    host_id: str = ""  # 主持人
    host_name: str = ""
    achiever_id: str = ""  # 成就君
    achiever_name: str = ""
    description: str = ""
    materials: List[dict] = []
    activity_mode: str = "线下"
    space_id: str = ""
    room_id: str = ""
    room_name: str = ""
    space_name: str = ""


class EmotionalReleaseSessionCreate(EmotionalReleaseSessionBase):
    pass


class EmotionalReleaseSession(EmotionalReleaseSessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
