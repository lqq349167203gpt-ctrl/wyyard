from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import internal_course_service
from app.models.internal_course import InternalCourseCreate

router = APIRouter(prefix="/api/internal-courses", tags=["internal-courses"])


@router.get("")
def list_courses(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None)):
    items = internal_course_service.list_courses()
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items = [i for i in items if i.get("customer_id") in allowed]
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_course(data: InternalCourseCreate):
    return internal_course_service.create_course(data)


@router.patch("/{course_id}")
def update_course(course_id: str, data: dict):
    course = internal_course_service.update_course(course_id, data)
    if not course:
        raise HTTPException(status_code=404, detail="记录不存在")
    return course


@router.delete("/{course_id}")
def delete_course(course_id: str):
    if not internal_course_service.delete_course(course_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return internal_course_service.search_customers(q)
