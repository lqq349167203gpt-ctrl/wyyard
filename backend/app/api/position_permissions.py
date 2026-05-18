from fastapi import APIRouter
from pydantic import BaseModel
from app.services import position_permission_service

router = APIRouter(prefix="/api/position-permissions", tags=["position-permissions"])


class PermissionUpdate(BaseModel):
    position: str
    pages: list[str]


@router.get("")
async def get_all():
    return position_permission_service.get_all()


@router.get("/{position}")
async def get_permissions(position: str):
    return {"position": position, "pages": position_permission_service.get_permissions(position)}


@router.put("")
async def set_permissions(data: PermissionUpdate):
    position_permission_service.set_permissions(data.position, data.pages)
    return {"message": "已保存"}
