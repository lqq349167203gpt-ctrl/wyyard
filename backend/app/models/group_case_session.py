from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class GroupCaseSessionBase(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    owner_id: str  # 案主
    owner_name: str
    description: str = ""  # 个案详情
    participant_ids: List[str] = []  # 参与者
    achiever_id: str = ""  # 成就君
    achiever_name: str = ""
    host_id: str = ""  # 主持人
    host_name: str = ""
    materials: List[dict] = []
    activity_mode: str = "线下"
    space_id: str = ""
    room_id: str = ""


class GroupCaseSessionCreate(GroupCaseSessionBase):
    pass


class GroupCaseSession(GroupCaseSessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
