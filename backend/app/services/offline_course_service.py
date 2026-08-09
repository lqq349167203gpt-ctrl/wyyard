import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.offline_course import OfflineCourse, OfflineCourseCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "offline_courses.json"
_courses: Dict[str, OfflineCourse] = {}


def _migrate_closers(item: OfflineCourse):
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]


def _load():
    global _courses
    data = load_data(FILENAME)
    _courses = {}
    for k, v in data.items():
        course = OfflineCourse(**v)
        _migrate_closers(course)
        _courses[k] = course


def _save(course_id: str = ""):
    if course_id:
        item = _courses.get(course_id)
        if item:
            save_item(FILENAME, course_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _courses.items()}
        save_data(FILENAME, data)


_load()


def list_courses() -> List[OfflineCourse]:
    return [v for v in _courses.values() if not v.is_deleted]


def get_course(course_id: str) -> Optional[OfflineCourse]:
    course = _courses.get(course_id)
    if course and course.is_deleted:
        return None
    return course


def create_course(data: OfflineCourseCreate) -> OfflineCourse:
    now = datetime.now(timezone.utc)
    course = OfflineCourse(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _courses[course.id] = course
    _save(course.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return course


def update_course(course_id: str, data: dict) -> Optional[OfflineCourse]:
    course = _courses.get(course_id)
    if not course or course.is_deleted:
        return None
    for key, value in data.items():
        if hasattr(course, key) and key not in ("id", "created_at", "created_by"):
            setattr(course, key, value)
    course.updated_at = datetime.now(timezone.utc)
    _courses[course_id] = course
    _save(course_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return course


def delete_course(course_id: str) -> tuple[bool, str]:
    course = _courses.get(course_id)
    if not course:
        return False, "记录不存在"
    course.is_deleted = True
    course.deleted_at = datetime.now(timezone.utc)
    _save(course_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return True, "删除成功"


def search_customers(keyword: str) -> list:
    if not keyword:
        return []
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
            })
    return results
