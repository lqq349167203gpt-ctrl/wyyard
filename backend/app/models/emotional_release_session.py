from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class EmotionalReleaseSessionBase(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    owner_id: str  # 案主
    owner_name: str
    participant_ids: List[str] = []  # 参与者
    achiever_id: str = ""  # 成就君
    achiever_name: str = ""
    host_id: str = ""  # 主持人
    host_name: str = ""
    materials: List[dict] = []


class EmotionalReleaseSessionCreate(EmotionalReleaseSessionBase):
    pass


class EmotionalReleaseSession(EmotionalReleaseSessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
