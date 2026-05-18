from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class CourseBase(BaseModel):
    type: str  # 课程类型
    name: str
    teachers: List[str] = []  # List of teacher IDs (课程老师)
    class_count: int = 0  # 已上课数


class CourseCreate(CourseBase):
    pass


class Course(CourseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
