from fastapi import APIRouter, HTTPException, Query

from app.models.course import CourseCreate
from app.utils.pagination import paginate
from app.services import course_service

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
async def list_courses(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = course_service.list_courses()
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
async def create_course(data: CourseCreate):
    return course_service.create_course(data)


@router.patch("/{course_id}")
async def update_course(course_id: str, data: dict):
    result = course_service.update_course(course_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="课程不存在")
    return result


@router.delete("/{course_id}")
async def delete_course(course_id: str):
    if not course_service.delete_course(course_id):
        raise HTTPException(status_code=404, detail="课程不存在")
    return {"message": "已删除"}
