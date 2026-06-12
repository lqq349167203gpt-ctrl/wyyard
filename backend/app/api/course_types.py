from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import course_type_service

router = APIRouter(prefix="/api/course-types", tags=["course-types"])


class CourseTypeCreate(BaseModel):
    name: str


class CourseTypeRename(BaseModel):
    new_name: str


@router.get("")
def list_types():
    return course_type_service.list_course_types()


@router.post("")
def create_type(data: CourseTypeCreate):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="类型名称不能为空")
    return {"name": course_type_service.create_course_type(data.name.strip())}


@router.patch("/{name}")
def rename_type(name: str, data: CourseTypeRename):
    if not data.new_name.strip():
        raise HTTPException(status_code=400, detail="类型名称不能为空")
    try:
        if not course_type_service.rename_course_type(name, data.new_name.strip()):
            raise HTTPException(status_code=404, detail="类型不存在")
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"message": "重命名成功"}


@router.delete("/{name}")
def delete_type(name: str):
    if not course_type_service.delete_course_type(name):
        raise HTTPException(status_code=404, detail="类型不存在")
    return {"message": "删除成功"}


class CourseTypeReorder(BaseModel):
    names: list[str]


@router.patch("")
def reorder_types(data: CourseTypeReorder):
    return course_type_service.reorder_course_types(data.names)
