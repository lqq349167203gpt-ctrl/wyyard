from typing import Optional

from fastapi import APIRouter, HTTPException

from app.models.base import StrictBaseModel
from app.services import course_type_service

router = APIRouter(prefix="/api/course-types", tags=["course-types"])


class CourseTypeCreate(StrictBaseModel):
    name: str
    organization_id: Optional[str] = ""
    list_image: Optional[str] = ""
    detail_images: Optional[list[str]] = []
    category: Optional[str] = "salon"


class CourseTypeRename(StrictBaseModel):
    new_name: str


class CourseTypeUpdate(StrictBaseModel):
    organization_id: Optional[str] = None
    list_image: Optional[str] = None
    detail_images: Optional[list[str]] = None
    category: Optional[str] = None


@router.get("")
def list_types():
    return course_type_service.list_course_types()


@router.post("")
def create_type(data: CourseTypeCreate):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="类型名称不能为空")
    try:
        return course_type_service.create_course_type(
            data.name.strip(), data.organization_id or "",
            list_image=data.list_image or "", detail_images=data.detail_images or [],
            category=data.category or "salon",
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/{name}")
def update_type(name: str, data: CourseTypeUpdate):
    if not course_type_service.update_course_type(
        name, data.organization_id,
        list_image=data.list_image, detail_images=data.detail_images,
        category=data.category,
    ):
        raise HTTPException(status_code=404, detail="类型不存在")
    return {"message": "更新成功"}


@router.put("/{name}/rename")
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
    try:
        if not course_type_service.delete_course_type(name):
            raise HTTPException(status_code=404, detail="类型不存在")
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"message": "删除成功"}


class CourseTypeReorder(StrictBaseModel):
    names: list[str]


@router.patch("")
def reorder_types(data: CourseTypeReorder):
    return course_type_service.reorder_course_types(data.names)
