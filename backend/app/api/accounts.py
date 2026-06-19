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
    accounts = account_service.list_accounts()
    # 移除密码字段，不返回给前端
    return [acc.model_dump(exclude={"password"}) for acc in accounts]


@router.post("")
async def create_account(data: AccountCreate):
    # 验证密码规则：8~15位，必须包含字母和数字
    if len(data.password) < 8 or len(data.password) > 15:
        raise HTTPException(status_code=400, detail="密码需要8~15位")
    if not any(c.isalpha() for c in data.password) or not any(c.isdigit() for c in data.password):
        raise HTTPException(status_code=400, detail="密码必须包含字母和数字")
    try:
        return account_service.create_account(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


ALL_PAGE_KEYS = [
    # 业务数据
    "business-reminders", "traffic-records", "activity-records",
    "consumption-records", "class-attendance",
    # 疗愈活动
    "healing-records", "class-records-visitors", "class-records-activities",
    "class-records-arrival", "class-records", "daily-activities",
    # 付费项目
    "payment", "membership-cards", "group-cases", "group-case-sessions",
    "emotional-releases", "emotional-release-sessions", "oh-card-readings",
    "energy-knots", "energy-knot-sessions", "internal-courses",
    "internal-course-sessions", "other-projects",
    # 信息配置
    "member-identities", "healing-identities", "organizations", "spaces", "reminders",
    # 账号管理
    "position-management", "change-password",
    # 系统配置
    "agents", "chat-history", "system-logs", "operation-logs",
]


@router.post("/login")
async def login(data: LoginRequest):
    result = account_service.login(data.username, data.password)
    if not result:
        return {"success": False, "message": "账号或密码错误"}

    # 移除密码字段，不返回给前端
    account_data = result.model_dump()
    account_data.pop("password", None)

    if result.role == "超级管理员":
        from app.services import member_identity_service
        all_identities = [i.name for i in member_identity_service.list_identities()]
        return {
            "success": True,
            "account": account_data,
            "permissions": ALL_PAGE_KEYS,
            "customer_permissions": all_identities,
            "customer_permissions_class_records": all_identities,
            "customer_permissions_payment": all_identities,
        }

    permissions = position_permission_service.get_permissions(result.role)
    return {
        "success": True,
        "account": account_data,
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
    # 验证新密码规则：8~15位，必须包含字母和数字
    if len(data.new_password) < 8 or len(data.new_password) > 15:
        raise HTTPException(status_code=400, detail="密码需要8~15位")
    if not any(c.isalpha() for c in data.new_password) or not any(c.isdigit() for c in data.new_password):
        raise HTTPException(status_code=400, detail="密码必须包含字母和数字")
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
