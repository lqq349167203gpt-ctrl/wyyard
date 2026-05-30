import uuid
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from typing import List, Optional, Dict

from app.models.internal_course import InternalCourse, InternalCourseCreate
from app.services.storage import load_data, save_data
from app.services import customer_service

FILENAME = "internal_courses.json"
_courses: Dict[str, InternalCourse] = {}


def _load():
    global _courses
    data = load_data(FILENAME)
    _courses = {}
    for k, v in data.items():
        _courses[k] = InternalCourse(**v)


def _save():
    data = {k: v.model_dump(mode="json") for k, v in _courses.items()}
    save_data(FILENAME, data)


_load()


def _calc_expiry(effective_date: str, course_type: str) -> Optional[str]:
    """根据课程类型自动计算到期日期"""
    durations = {
        "疗愈师课程：自爱力构建": 12,  # 1年
        "商业框架陪跑：自觉力提升": 3,   # 3个月
        "落地赋能班：自洽力整合": 12,    # 1年
    }
    months = durations.get(course_type)
    if not months:
        return None
    try:
        start = datetime.strptime(effective_date, "%Y-%m-%d")
        end = start + relativedelta(months=months)
        return end.strftime("%Y-%m-%d")
    except ValueError:
        return None


def list_courses() -> List[InternalCourse]:
    return [v for v in _courses.values() if not v.is_deleted]


def get_course(course_id: str) -> Optional[InternalCourse]:
    course = _courses.get(course_id)
    if course and course.is_deleted:
        return None
    return course


def create_course(data: InternalCourseCreate) -> InternalCourse:
    now = datetime.now(timezone.utc)
    course_data = data.model_dump()
    course_data["expiry_date"] = _calc_expiry(
        course_data["effective_date"], course_data["course_type"]
    )
    course = InternalCourse(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **course_data,
    )
    _courses[course.id] = course
    _save()
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return course


def update_course(course_id: str, data: dict) -> Optional[InternalCourse]:
    course = _courses.get(course_id)
    if not course:
        return None
    for key, value in data.items():
        if hasattr(course, key) and key not in ("id", "created_at"):
            setattr(course, key, value)
    course.expiry_date = _calc_expiry(course.effective_date, course.course_type)
    course.updated_at = datetime.now(timezone.utc)
    _courses[course_id] = course
    _save()
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return course


def delete_course(course_id: str) -> bool:
    course = _courses.get(course_id)
    if not course:
        return False
    course.is_deleted = True
    course.deleted_at = datetime.now(timezone.utc)
    _save()
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return True


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
