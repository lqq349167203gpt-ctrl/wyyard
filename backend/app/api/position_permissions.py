from fastapi import APIRouter
from pydantic import BaseModel
from app.services import position_permission_service, position_customer_permission_service, position_page_permission_service

router = APIRouter(prefix="/api/position-permissions", tags=["position-permissions"])


class PermissionUpdate(BaseModel):
    position: str
    pages: list[str]


class FullPermissionUpdate(BaseModel):
    position: str
    pages: list[str]
    customers: list[str] = []
    class_records: list[str] = []
    payment: list[str] = []
    page_permissions: dict[str, list[str]] = {}


@router.get("")
async def get_all():
    return position_permission_service.get_all()


@router.get("/page-permissions")
async def get_all_page_permissions():
    return position_page_permission_service.get_all()


@router.get("/page-permissions/{position}")
async def get_page_permissions(position: str):
    return position_page_permission_service.get_all()


@router.get("/{position}")
async def get_permissions(position: str):
    return {"position": position, "pages": position_permission_service.get_permissions(position)}


@router.put("")
async def set_permissions(data: PermissionUpdate):
    position_permission_service.set_permissions(data.position, data.pages)
    return {"message": "已保存"}


@router.put("/full")
async def set_full_permissions(data: FullPermissionUpdate):
    position_permission_service.set_permissions(data.position, data.pages)
    if data.customers:
        position_customer_permission_service.set_customer_permissions("customers", data.position, data.customers)
    if data.class_records:
        position_customer_permission_service.set_customer_permissions("class_records", data.position, data.class_records)
    if data.payment:
        position_customer_permission_service.set_customer_permissions("payment", data.position, data.payment)
    # 按页面存储的权限
    for page_key, member_types in data.page_permissions.items():
        position_page_permission_service.set_page_permissions(page_key, data.position, member_types)
    return {"message": "已保存"}


@router.put("/page-permissions")
async def set_page_permissions(data: dict):
    for page_key, positions in data.items():
        for position, member_types in positions.items():
            position_page_permission_service.set_page_permissions(page_key, position, member_types)
    return {"message": "已保存"}
