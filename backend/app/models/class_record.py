from datetime import datetime
from typing import List, Optional

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class GroupMember(SafeBaseModel):
    name: str = ""
    member_ids: List[str] = []
    leader_id: str = ""
    deputy_id: str = ""


class ClassRecordBase(SafeBaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    course_id: str
    course_name: str
    course_type: str = ""  # 活动类型（如：读书会、颂钵等）
    course_description: str = ""
    activity_name: str = ""  # 用户自定义活动名称（优先于 course_name 显示）
    teacher_ids: List[str] = []
    participant_ids: List[str] = []
    materials: List[dict] = []
    groups: List[GroupMember] = []
    is_public_welfare: bool = False
    is_published: bool = False
    activity_mode: str = "线下"
    membership_deduction_count: int = Field(default=1, ge=0)
    space_id: str = ""
    room_id: str = ""
    room_name: str = ""
    space_name: str = ""


class ClassRecordCreate(StrictBaseModel):
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    course_id: str
    course_name: str
    course_type: str = ""  # 活动类型（如：读书会、颂钵等）
    activity_name: str = ""  # 用户自定义活动名称（优先于 course_name 显示）
    course_description: str = ""
    teacher_ids: List[str] = []
    participant_ids: List[str] = []
    is_public_welfare: bool = False
    is_published: bool = False
    activity_mode: str = "线下"
    membership_deduction_count: int = Field(default=1, ge=0)
    space_id: str = ""
    room_id: str = ""
    room_name: str = ""
    space_name: str = ""


class ClassRecord(ClassRecordBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
