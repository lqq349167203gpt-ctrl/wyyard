from fastapi import APIRouter, HTTPException

from app.models.course import CourseCreate
from app.services import course_service

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
async def list_courses():
    return course_service.list_courses()


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
