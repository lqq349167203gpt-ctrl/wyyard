from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import internal_course_service
from app.models.internal_course import InternalCourseCreate

router = APIRouter(prefix="/api/internal-courses", tags=["internal-courses"])


@router.get("")
def list_courses(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    items = internal_course_service.list_courses()
    items_dict = [i.model_dump() if hasattr(i, "model_dump") else i for i in items]
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items_dict = [i for i in items_dict if i.get("customer_id") in allowed]
    if nickname:
        kw = nickname.lower()
        items_dict = [i for i in items_dict if kw in (i.get("nickname") or "").lower()]
    if closer_name:
        kw = closer_name.lower()
        items_dict = [i for i in items_dict if kw in (i.get("closer_name") or "").lower() or any(kw in (c.get("name") or "").lower() for c in (i.get("closers") or []))]
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


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
