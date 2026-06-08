from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.account import AccountCreate, RoleCreate
from app.services import account_service, position_permission_service, position_customer_permission_service

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


# ===== 账号 =====

@router.get("")
async def list_accounts():
    return account_service.list_accounts()


@router.post("")
async def create_account(data: AccountCreate):
    try:
        return account_service.create_account(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


ALL_PAGE_KEYS = [
    "healing-records", "activity-records", "traffic-records",
    "class-records-visitors", "class-records-activities", "class-records-arrival",
    "daily-activities", "payment", "membership-cards", "group-cases",
    "emotional-releases", "energy-knots", "internal-courses", "other-projects",
    "agents", "business-reminders", "system-logs", "operation-logs",
    "member-identities", "healing-identities", "position-management",
    "courses", "spaces", "reminders",
]


@router.post("/login")
async def login(data: LoginRequest):
    result = account_service.login(data.username, data.password)
    if not result:
        return {"success": False, "message": "账号或密码错误"}

    if result.role == "超级管理员":
        from app.services import member_identity_service
        all_identities = [i.name for i in member_identity_service.list_identities()]
        return {
            "success": True,
            "account": result,
            "permissions": ALL_PAGE_KEYS,
            "customer_permissions": all_identities,
            "customer_permissions_class_records": all_identities,
            "customer_permissions_payment": all_identities,
        }

    permissions = position_permission_service.get_permissions(result.role)
    return {
        "success": True,
        "account": result,
        "permissions": permissions,
        "customer_permissions": position_customer_permission_service.get_customer_permissions("customers", result.role),
        "customer_permissions_class_records": position_customer_permission_service.get_customer_permissions("class_records", result.role),
        "customer_permissions_payment": position_customer_permission_service.get_customer_permissions("payment", result.role),
    }


@router.patch("/{account_id}")
async def update_account(account_id: str, data: dict):
    result = account_service.update_account(account_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="账号不存在")
    return result


@router.delete("/{account_id}")
async def delete_account(account_id: str):
    if not account_service.delete_account(account_id):
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"message": "已删除"}


@router.post("/{account_id}/change-password")
async def change_password(account_id: str, data: ChangePasswordRequest):
    try:
        result = account_service.change_password(account_id, data.old_password, data.new_password)
        if not result:
            raise HTTPException(status_code=404, detail="账号不存在")
        return {"message": "密码修改成功"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== 角色 =====

@router.get("/roles")
async def list_roles():
    return account_service.list_roles()


@router.post("/roles")
async def create_role(data: RoleCreate):
    return account_service.create_role(data)


@router.patch("/roles/{role_id}")
async def update_role(role_id: str, data: dict):
    result = account_service.update_role(role_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="角色不存在")
    return result


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str):
    if not account_service.delete_role(role_id):
        raise HTTPException(status_code=404, detail="角色不存在")
    return {"message": "已删除"}
