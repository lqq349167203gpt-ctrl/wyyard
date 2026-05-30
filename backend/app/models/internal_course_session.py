from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class InternalCourseSessionBase(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    course_type: str = ""  # 课程类型
    course_name: str  # 课程名称
    course_description: str = ""
    host_ids: List[str] = []  # 课程老师（多选）
    host_names: List[str] = []
    participant_ids: List[str] = []  # 参与者
    materials: List[dict] = []
    space_id: str = ""
    room_id: str = ""


class InternalCourseSessionCreate(InternalCourseSessionBase):
    pass


class InternalCourseSession(InternalCourseSessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
