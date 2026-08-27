from datetime import datetime
from typing import List, Optional

from pydantic import Field

from app.models.base import SafeBaseModel


class InternalCourseSessionBase(SafeBaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    course_type: str = ""  # 课程类型
    course_name: str  # 课程名称
    course_description: str = ""
    teacher_ids: List[str] = []  # 老师（多选）
    host_id: str = ""  # 主持人
    host_name: str = ""
    participant_ids: List[str] = []  # 参与者
    materials: List[dict] = []
    is_published: bool = False
    activity_mode: str = "线下"
    membership_deduction_count: int = Field(default=1, ge=0)
    space_id: str = ""
    room_id: str = ""
    room_name: str = ""
    space_name: str = ""
    created_by_id: str = ""
    created_by: str = ""


class InternalCourseSessionCreate(InternalCourseSessionBase):
    pass


class InternalCourseSession(InternalCourseSessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
