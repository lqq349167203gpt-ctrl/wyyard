import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.course import Course, CourseCreate
from app.services.storage import load_data, save_data, save_item

FILENAME = "courses.json"
_courses: Dict[str, Course] = {}


def _load():
    global _courses
    data = load_data(FILENAME)
    _courses = {}
    for k, v in data.items():
        # Handle missing type field for backward compatibility
        if "type" not in v:
            v["type"] = "未分类"
        _courses[k] = Course(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _courses.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _courses.items()}
        save_data(FILENAME, data)


_load()


def list_courses() -> List[Course]:
    return [v for v in _courses.values() if not v.is_deleted]


def get_course(course_id: str) -> Optional[Course]:
    course = _courses.get(course_id)
    if course and course.is_deleted:
        return None
    return course


def create_course(data: CourseCreate) -> Course:
    now = datetime.now(timezone.utc)
    course = Course(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _courses[course.id] = course
    _save(course.id)
    return course


def update_course(course_id: str, data: dict) -> Optional[Course]:
    course = _courses.get(course_id)
    if not course:
        return None
    for key, value in data.items():
        if hasattr(course, key):
            setattr(course, key, value)
    course.updated_at = datetime.now(timezone.utc)
    _courses[course_id] = course
    _save(course_id)
    return course


def delete_course(course_id: str) -> bool:
    course = _courses.get(course_id)
    if not course:
        return False
    course.is_deleted = True
    course.deleted_at = datetime.now(timezone.utc)
    _save(course_id)
    return True
