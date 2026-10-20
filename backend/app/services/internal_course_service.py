import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException

from app.models.internal_course import InternalCourse, InternalCourseCreate
from app.services import customer_service
from app.services.storage import load_data, save_data, save_item

DEFAULT_LEARNING_MONTHS = 12

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


def _positive_months(value, fallback: int = DEFAULT_LEARNING_MONTHS) -> int:
    if value is None or value == "":
        return fallback
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise HTTPException(status_code=400, detail="有效期须为正整数月")
    return value


def _calc_expiry(effective_date: str, months: int) -> Optional[str]:
    """按自然月计算到期日，与线下落地课程同一天算法：生效日加月数再减一天。"""
    if not effective_date or not months or months <= 0:
        return None
    try:
        start = datetime.strptime(effective_date, "%Y-%m-%d")
    except ValueError:
        return None
    end = start + relativedelta(months=months) - relativedelta(days=1)
    return end.strftime("%Y-%m-%d")


def _months_between(effective_date: str, expiry_date: str) -> Optional[int]:
    """从已保存的起止日反推月数，避免旧记录在未改有效期时被默认成一年。"""
    if not effective_date or not expiry_date:
        return None
    try:
        start = datetime.strptime(effective_date, "%Y-%m-%d")
        end = datetime.strptime(expiry_date, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return None
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if months > 0 and start + relativedelta(months=months) == end:
        return months
    return None


def list_courses() -> List[InternalCourse]:
    return [v for v in _courses.values() if not v.is_deleted]


def get_active_course(customer_id: str, usage_date: Optional[str] = None) -> Optional[InternalCourse]:
    """返回客户指定日期生效的沙龙技能学习权益，多个权益时优先使用最早到期的一项。"""
    target_date = usage_date or datetime.now().strftime("%Y-%m-%d")
    from app.services.project_refund_service import is_project_refunded
    active = [
        course
        for course in _courses.values()
        if not course.is_deleted
        and not is_project_refunded("internal-courses", course.id)
        and course.customer_id == customer_id
        and course.effective_date
        and course.expiry_date
        and course.effective_date <= target_date <= course.expiry_date
    ]
    active.sort(key=lambda course: (course.expiry_date or "9999-12-31", course.effective_date, course.id))
    return active[0] if active else None


def has_active_course(customer_id: str, usage_date: Optional[str] = None) -> bool:
    """判断用户在指定日期是否有有效期内的沙龙技能学习。"""
    return get_active_course(customer_id, usage_date) is not None


def get_course(course_id: str) -> Optional[InternalCourse]:
    course = _courses.get(course_id)
    if course and course.is_deleted:
        return None
    return course


def create_course(data: InternalCourseCreate) -> InternalCourse:
    now = datetime.now(timezone.utc)
    course_data = data.model_dump()
    months = _positive_months(course_data.get("validity_value"))
    course_data["validity_value"] = months
    course_data["expiry_date"] = _calc_expiry(course_data["effective_date"], months)
    course = InternalCourse(
        id=str(uuid.uuid4())[:12],
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
    if not course or course.is_deleted:
        return None
    previous_effective = course.effective_date
    previous_expiry = course.expiry_date or ""
    date_changed = "effective_date" in data and data["effective_date"] != course.effective_date
    validity_changed = "validity_value" in data and data["validity_value"] != course.validity_value
    for key, value in data.items():
        if hasattr(course, key) and key not in ("id", "created_at", "created_by", "is_deleted", "deleted_at", "expiry_date"):
            setattr(course, key, value)
    if date_changed or validity_changed:
        months = _positive_months(
            course.validity_value,
            _months_between(previous_effective, previous_expiry) or DEFAULT_LEARNING_MONTHS,
        )
        course.validity_value = months
        course.expiry_date = _calc_expiry(course.effective_date, months)
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
                "member_type": c.member_type, "card_status": getattr(c, "card_status", ""), "card_status_tone": getattr(c, "card_status_tone", "neutral"),
            })
    return results


def rename_course_type(old_type: str, new_type: str) -> int:
    count = 0
    affected_customers = set()
    for course in _courses.values():
        if course.course_type == old_type:
            course.course_type = new_type
            _save(course.id)
            affected_customers.add(course.customer_id)
            count += 1
    # 课程类型变更影响身份条件匹配
    if affected_customers:
        from app.services.member_identity_service import refresh_member_type
        for cid in affected_customers:
            try:
                refresh_member_type(cid)
            except Exception:
                pass
    return count
