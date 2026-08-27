from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import Field

from app.middleware.jwt_auth import require_page_permission
from app.models.base import StrictBaseModel
from app.services import (
    position_edit_permission_service,
    position_page_permission_service,
    position_permission_service,
)

router = APIRouter(prefix="/api/position-permissions", tags=["position-permissions"])
require_account_manager = require_page_permission("position-management")


class PermissionUpdate(StrictBaseModel):
    position: str
    pages: list[str]


class FullPermissionUpdate(StrictBaseModel):
    position: str
    pages: list[str]
    edit_permissions: dict[str, Literal["own", "all"]] = Field(default_factory=dict)


@router.get("")
async def get_all():
    return position_permission_service.get_all()


@router.get("/page-permissions")
async def get_all_page_permissions():
    return position_page_permission_service.get_all()


@router.get("/page-permissions/{position}")
async def get_page_permissions(position: str):
    # 按 position 查：遍历所有 page，每个 page 取该 position 的 member_types；返回 {page_key: [member_types]}
    all_perms = position_page_permission_service.get_all()
    return {page: perms.get(position, []) for page, perms in all_perms.items()}


@router.get("/edit-permissions")
async def get_all_edit_permissions():
    return position_edit_permission_service.get_all()


@router.get("/{position}")
async def get_permissions(position: str):
    return {
        "position": position,
        "pages": position_permission_service.get_permissions(position),
        "edit_permissions": position_edit_permission_service.get_permissions(position),
    }


@router.put("")
async def set_permissions(data: PermissionUpdate, _manager_role: str = Depends(require_account_manager)):
    position_permission_service.set_permissions(data.position, data.pages)
    return {"message": "已保存"}


@router.put("/full")
async def set_full_permissions(data: FullPermissionUpdate, _manager_role: str = Depends(require_account_manager)):
    position_permission_service.set_permissions(data.position, data.pages)
    edit_permissions = dict(data.edit_permissions)
    if "class-records" not in data.pages:
        edit_permissions["visits"] = "own"
    if "daily-activities" not in data.pages:
        edit_permissions["activities"] = "own"
    position_edit_permission_service.set_permissions(data.position, edit_permissions)
    return {"message": "已保存"}


@router.put("/page-permissions")
async def set_page_permissions(data: dict, _manager_role: str = Depends(require_account_manager)):
    for page_key, positions in data.items():
        for position, member_types in positions.items():
            position_page_permission_service.set_page_permissions(page_key, position, member_types)
    return {"message": "已保存"}
