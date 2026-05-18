from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import course_type_service

router = APIRouter(prefix="/api/course-types", tags=["course-types"])


class CourseTypeCreate(BaseModel):
    name: str


@router.get("")
def list_types():
    return course_type_service.list_course_types()


@router.post("")
def create_type(data: CourseTypeCreate):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="类型名称不能为空")
    return {"name": course_type_service.create_course_type(data.name.strip())}


@router.delete("/{name}")
def delete_type(name: str):
    if not course_type_service.delete_course_type(name):
        raise HTTPException(status_code=404, detail="类型不存在")
    return {"message": "删除成功"}
