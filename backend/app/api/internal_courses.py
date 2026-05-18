from fastapi import APIRouter, HTTPException
from app.services import internal_course_service
from app.models.internal_course import InternalCourseCreate

router = APIRouter(prefix="/api/internal-courses", tags=["internal-courses"])


@router.get("")
def list_courses():
    return internal_course_service.list_courses()


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
