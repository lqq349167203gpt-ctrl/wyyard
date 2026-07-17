from fastapi import APIRouter, Depends
from app.middleware.jwt_auth import require_admin
from app.models.base import StrictBaseModel
from app.services import position_permission_service, position_customer_permission_service, position_page_permission_service

router = APIRouter(prefix="/api/position-permissions", tags=["position-permissions"])


class PermissionUpdate(StrictBaseModel):
    position: str
    pages: list[str]


class FullPermissionUpdate(StrictBaseModel):
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
    # 按 position 查：遍历所有 page，每个 page 取该 position 的 member_types；返回 {page_key: [member_types]}
    all_perms = position_page_permission_service.get_all()
    return {page: perms.get(position, []) for page, perms in all_perms.items()}


@router.get("/{position}")
async def get_permissions(position: str):
    return {"position": position, "pages": position_permission_service.get_permissions(position)}


@router.put("")
async def set_permissions(data: PermissionUpdate, _admin: str = Depends(require_admin)):
    position_permission_service.set_permissions(data.position, data.pages)
    return {"message": "已保存"}


@router.put("/full")
async def set_full_permissions(data: FullPermissionUpdate, _admin: str = Depends(require_admin)):
    position_permission_service.set_permissions(data.position, data.pages)
    # 无条件写入三块客户权限；空列表表示"该 position 不可见任何身份"，必须落盘
    position_customer_permission_service.set_customer_permissions("customers", data.position, data.customers)
    position_customer_permission_service.set_customer_permissions("class_records", data.position, data.class_records)
    position_customer_permission_service.set_customer_permissions("payment", data.position, data.payment)
    # 按页面存储的权限：page_permissions 缺失的 page 不会清空（保留旧值），
    # 这是为了支持增量保存；前端若需清空某 page 应显式传空列表
    for page_key, member_types in data.page_permissions.items():
        position_page_permission_service.set_page_permissions(page_key, data.position, member_types)
    return {"message": "已保存"}


@router.put("/page-permissions")
async def set_page_permissions(data: dict, _admin: str = Depends(require_admin)):
    for page_key, positions in data.items():
        for position, member_types in positions.items():
            position_page_permission_service.set_page_permissions(page_key, position, member_types)
    return {"message": "已保存"}
