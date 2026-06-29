import uuid
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from typing import List, Optional, Dict

from app.models.internal_course import InternalCourse, InternalCourseCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "internal_courses.json"
_courses: Dict[str, InternalCourse] = {}


def _migrate_closers(item: InternalCourse) -> InternalCourse:
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]
    return item


def _load():
    global _courses
    data = load_data(FILENAME)
    _courses = {}
    for k, v in data.items():
        _courses[k] = _migrate_closers(InternalCourse(**v))


def _save(item_id: str = ""):
    if item_id:
        item = _courses.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _courses.items()}
        save_data(FILENAME, data)


_load()


def _calc_expiry(effective_date: str, course_type: str) -> Optional[str]:
    """根据课程类型自动计算到期日期"""
    durations = {
        "疗愈师课程：自爱力构建": 12,  # 1年
        "商业框架陪跑：自觉力提升": 3,   # 3个月
        "落地赋能班：自洽力整合": 24,    # 2年
    }
    months = durations.get(course_type)
    if not months:
        return None
    try:
        start = datetime.strptime(effective_date, "%Y-%m-%d")
        end = start + relativedelta(months=months) - relativedelta(days=1)
        return end.strftime("%Y-%m-%d")
    except ValueError:
        return None


def list_courses() -> List[InternalCourse]:
    return [v for v in _courses.values() if not v.is_deleted]


def has_active_course(customer_id: str) -> bool:
    """判断用户是否有有效期内的内部课程"""
    today = datetime.now().strftime("%Y-%m-%d")
    for c in _courses.values():
        if c.is_deleted or c.customer_id != customer_id:
            continue
        if c.effective_date and c.expiry_date and c.effective_date <= today <= c.expiry_date:
            return True
    return False


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
    _save(course.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return course


def update_course(course_id: str, data: dict) -> Optional[InternalCourse]:
    course = _courses.get(course_id)
    if not course:
        return None
    for key, value in data.items():
        if hasattr(course, key) and key not in ("id", "created_at", "created_by"):
            setattr(course, key, value)
    course.expiry_date = _calc_expiry(course.effective_date, course.course_type)
    course.updated_at = datetime.now(timezone.utc)
    _courses[course_id] = course
    _save(course_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(course.customer_id)
    return course


def delete_course(course_id: str) -> bool:
    course = _courses.get(course_id)
    if not course:
        return False
    course.is_deleted = True
    course.deleted_at = datetime.now(timezone.utc)
    _save(course_id)
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


def rename_course_type(old_type: str, new_type: str) -> int:
    count = 0
    for course in _courses.values():
        if course.course_type == old_type:
            course.course_type = new_type
            _save(course.id)
            count += 1
    return count
