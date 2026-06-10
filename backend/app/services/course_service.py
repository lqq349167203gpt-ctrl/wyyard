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
    old_name = course.name
    old_type = course.type
    for key, value in data.items():
        if hasattr(course, key):
            setattr(course, key, value)
    course.updated_at = datetime.now(timezone.utc)
    _courses[course_id] = course
    _save(course_id)
    # 级联更新：活动名称变更
    if "name" in data and data["name"] != old_name:
        from app.services.class_record_service import rename_course_name as rename_cr
        from app.services.internal_course_session_service import rename_course_name as rename_ics
        rename_cr(old_name, data["name"])
        rename_ics(old_name, data["name"])
    # 级联更新：活动类型变更
    if "type" in data and data["type"] != old_type:
        from app.services.internal_course_session_service import rename_course_type as rename_ics_type
        rename_ics_type(old_type, data["type"])
    return course


def delete_course(course_id: str) -> bool:
    course = _courses.get(course_id)
    if not course:
        return False
    course.is_deleted = True
    course.deleted_at = datetime.now(timezone.utc)
    _save(course_id)
    return True


def rename_course_type(old_name: str, new_name: str) -> int:
    count = 0
    for course in _courses.values():
        if not course.is_deleted and course.type == old_name:
            course.type = new_name
            course.updated_at = datetime.now(timezone.utc)
            count += 1
    if count > 0:
        _save()
    return count
