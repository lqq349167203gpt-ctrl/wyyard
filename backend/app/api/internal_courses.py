from fastapi import APIRouter, HTTPException, Query, Request

from app.models.internal_course import InternalCourseCreate
from app.services import customer_access_service, internal_course_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/internal-courses", tags=["internal-courses"])


@router.get("")
def list_courses(request: Request, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = internal_course_service.list_courses()
    items_dict = [i.model_dump() if hasattr(i, "model_dump") else i for i in items]
    items_dict = customer_access_service.filter_record_dicts(request, items_dict)
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items_dict = [i for i in items_dict if i.get("customer_id") in allowed]
    if nickname:
        kw = nickname.lower()
        items_dict = [i for i in items_dict if kw in (i.get("nickname") or "").lower()]
    if closer_name:
        kw = closer_name.lower()
        items_dict = [i for i in items_dict if kw in (i.get("closer_name") or "").lower() or any(kw in (c.get("name") or "").lower() for c in (i.get("closers") or []))]
    items_dict.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    customer_access_service.require_transaction_access(request, detail=True)
    return customer_access_service.filter_customer_search_results(
        request, internal_course_service.search_customers(q)
    )


@router.get("/{course_id}")
def get_course(course_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    course = internal_course_service.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, course.customer_id)
    return course


@router.post("")
def create_course(data: InternalCourseCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    return internal_course_service.create_course(data)


@router.patch("/{course_id}")
def update_course(course_id: str, data: dict, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = internal_course_service.get_course(course_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    if data.get("customer_id") and data["customer_id"] != existing.customer_id:
        customer_access_service.require_customer_scope(request, data["customer_id"], action="新增付费项目到")
    course = internal_course_service.update_course(course_id, data)
    if not course:
        raise HTTPException(status_code=404, detail="记录不存在")
    return course


@router.delete("/{course_id}")
def delete_course(course_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = internal_course_service.get_course(course_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    if not internal_course_service.delete_course(course_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}
