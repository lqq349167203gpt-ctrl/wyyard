from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class GroupMember(BaseModel):
    name: str = ""
    member_ids: List[str] = []
    leader_id: str = ""
    deputy_id: str = ""


class ClassRecordBase(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    course_id: str
    course_name: str
    course_description: str = ""
    teacher_ids: List[str] = []
    participant_ids: List[str] = []
    materials: List[dict] = []
    groups: List[GroupMember] = []
    is_public_welfare: bool = False
    space_id: str = ""
    room_id: str = ""


class ClassRecordCreate(BaseModel):
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    course_id: str
    course_name: str
    course_description: str = ""
    teacher_ids: List[str] = []
    is_public_welfare: bool = False
    space_id: str = ""
    room_id: str = ""


class ClassRecord(ClassRecordBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
