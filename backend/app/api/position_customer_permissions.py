from fastapi import APIRouter, Depends

from app.middleware.jwt_auth import require_page_permission
from app.models.base import StrictBaseModel
from app.services import position_customer_permission_service

router = APIRouter(prefix="/api/position-customer-permissions", tags=["position-customer-permissions"])
require_account_manager = require_page_permission("position-management")

VALID_SECTIONS = {"customers", "class_records", "payment"}


class CustomerPermissionUpdate(StrictBaseModel):
    position: str
    member_types: list[str]


class CustomerPermissionBatchUpdate(StrictBaseModel):
    position: str
    customers: list[str] = []
    class_records: list[str] = []
    payment: list[str] = []


@router.get("/{section}")
def get_all(section: str):
    return position_customer_permission_service.get_all(section)


@router.get("/{section}/{position}")
def get_for_position(section: str, position: str):
    return {
        "position": position,
        "member_types": position_customer_permission_service.get_customer_permissions(section, position),
    }


@router.put("/batch")
def set_permissions_batch(data: CustomerPermissionBatchUpdate, _manager_role: str = Depends(require_account_manager)):
    position_customer_permission_service.set_customer_permissions("customers", data.position, data.customers)
    position_customer_permission_service.set_customer_permissions("class_records", data.position, data.class_records)
    position_customer_permission_service.set_customer_permissions("payment", data.position, data.payment)
    return {"message": "已保存"}


@router.put("/{section}")
def set_permissions(section: str, data: CustomerPermissionUpdate, _manager_role: str = Depends(require_account_manager)):
    position_customer_permission_service.set_customer_permissions(section, data.position, data.member_types)
    return {"message": "已保存"}
