from fastapi import APIRouter, Depends, HTTPException
from starlette.requests import Request as StarletteRequest

from app.middleware.jwt_auth import create_access_token, decode_token, require_page_permission
from app.middleware.rate_limit import limiter
from app.models.account import AccountCreate, AccountUpdate, RoleCreate, RoleUpdate
from app.models.base import StrictBaseModel
from app.services import (
    account_service,
    position_customer_permission_service,
    position_permission_service,
    session_service,
)

router = APIRouter(prefix="/api/accounts", tags=["accounts"])
require_account_manager = require_page_permission("position-management")


class LoginRequest(StrictBaseModel):
    username: str
    password: str


class ChangePasswordRequest(StrictBaseModel):
    old_password: str
    new_password: str


class AdminResetPasswordRequest(StrictBaseModel):
    new_password: str


# ===== 账号 =====

@router.get("")
async def list_accounts(_manager_role: str = Depends(require_account_manager)):
    accounts = account_service.list_accounts()
    return [acc.model_dump(exclude={"password"}) for acc in accounts]


@router.get("/light")
async def list_accounts_light():
    # 轻量名单：登录即可访问，仅返回选择器所需的最小字段，供非管理员页面使用
    accounts = account_service.list_accounts()
    return [{"id": acc.id, "username": acc.username, "owner": acc.owner} for acc in accounts]


@router.post("")
@limiter.limit("3/minute")
async def create_account(
    data: AccountCreate,
    request: StarletteRequest,
    manager_role: str = Depends(require_account_manager),
):
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="密码至少8位")
    if len(data.password) > 128:
        raise HTTPException(status_code=400, detail="密码最多128位")
    if not any(c.isalpha() for c in data.password) or not any(c.isdigit() for c in data.password):
        raise HTTPException(status_code=400, detail="密码必须包含字母和数字")
    if manager_role != "超级管理员" and data.role == "超级管理员":
        raise HTTPException(status_code=403, detail="只有超级管理员可以创建超级管理员账号")
    try:
        result = account_service.create_account(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result.model_dump(exclude={"password"})


ALL_PAGE_KEYS = [
    # 数据
    "business-reminders", "referral-statistics",
    "member-statistics", "course-statistics", "product-sales", "statistics",
    # 报表
    "daily-report",
    # 业务
    "healing-records", "class-records-visitors", "class-records-activities",
    "class-records-arrival", "class-records", "daily-activities",
    "communication-records", "followup-records", "offline-course-records",
    # 付费
    "payment-deductions", "payment-refunds", "expenses", "debt-records",
    "payment", "membership-cards", "group-cases",
    "emotional-releases", "oh-card-readings",
    "energy-knots", "internal-courses", "tea-seat-fees", "offline-courses", "other-projects",
    # 信息配置
    "member-identities", "customer-tags", "healing-identities", "organizations", "spaces", "reminders",
    # 账号管理
    "position-management", "change-password", "disabled-customers",
    # 系统配置
    "agents", "chat-history", "system-logs", "operation-logs",
]


@router.post("/login")
@limiter.limit("5/minute")
async def login(data: LoginRequest, request: StarletteRequest):
    result = account_service.login(data.username, data.password)
    if not result:
        return {"success": False, "message": "账号或密码错误"}

    # 移除密码字段，不返回给前端
    account_data = result.model_dump()
    account_data.pop("password", None)

    # 生成 JWT
    token = create_access_token(
        account_id=result.id,
        username=result.username,
        owner=result.owner,
        role=result.role,
    )

    # 创建 session 记录
    payload = decode_token(token)
    jti = payload.get("jti", "")
    ua = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else ""
    session_service.create_session(jti, result.id, ua, ip)

    if result.role == "超级管理员":
        from app.services import member_identity_service
        all_identities = [i.name for i in member_identity_service.list_identities()]
        return {
            "success": True,
            "token": token,
            "account": account_data,
            "permissions": ALL_PAGE_KEYS,
            "customer_permissions": all_identities,
            "customer_permissions_class_records": all_identities,
            "customer_permissions_payment": all_identities,
        }

    permissions = position_permission_service.get_permissions(result.role)
    return {
        "success": True,
        "token": token,
        "account": account_data,
        "permissions": permissions,
        "customer_permissions": position_customer_permission_service.get_customer_permissions("customers", result.role),
        "customer_permissions_class_records": position_customer_permission_service.get_customer_permissions("class_records", result.role),
        "customer_permissions_payment": position_customer_permission_service.get_customer_permissions("payment", result.role),
    }


@router.patch("/{account_id}")
async def update_account(
    account_id: str,
    data: AccountUpdate,
    request: StarletteRequest,
    manager_role: str = Depends(require_account_manager),
):
    # 仅管理员可改账号资料（role/enabled/owner 等）；自助改密走 POST /{id}/change-password
    # 改密码必须走 POST /{id}/change-password，需要验证旧密码
    if data.password is not None:
        raise HTTPException(status_code=400, detail="修改密码请使用专门的密码修改接口")
    target = account_service.get_account(account_id)
    if manager_role != "超级管理员":
        if target and (target.role == "超级管理员" or target.is_system):
            raise HTTPException(status_code=403, detail="只有超级管理员可以修改超级管理员账号")
        if data.role == "超级管理员":
            raise HTTPException(status_code=403, detail="只有超级管理员可以授予超级管理员角色")
    try:
        result = account_service.update_account(account_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="账号不存在")
    return result.model_dump(exclude={"password"})


@router.delete("/{account_id}")
async def delete_account(account_id: str, manager_role: str = Depends(require_account_manager)):
    # 仅管理员可删除账号
    target = account_service.get_account(account_id)
    if manager_role != "超级管理员" and target and (target.role == "超级管理员" or target.is_system):
        raise HTTPException(status_code=403, detail="只有超级管理员可以删除超级管理员账号")
    if not account_service.delete_account(account_id):
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"message": "已删除"}


@router.post("/{account_id}/change-password")
@limiter.limit("3/minute")
async def change_password(account_id: str, data: ChangePasswordRequest, request: StarletteRequest):
    # 先校验账号存在：不存在的账号返回 404（账号本就可通过 /api/accounts/light 枚举，无额外泄露）
    if not account_service.get_account(account_id):
        raise HTTPException(status_code=404, detail="账号不存在")
    # 所有权检查：只能改自己的密码
    current_user_id = getattr(request.state, "user_id", "")
    if account_id != current_user_id:
        raise HTTPException(status_code=403, detail="权限不足")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="密码至少8位")
    if len(data.new_password) > 128:
        raise HTTPException(status_code=400, detail="密码最多128位")
    if not any(c.isalpha() for c in data.new_password) or not any(c.isdigit() for c in data.new_password):
        raise HTTPException(status_code=400, detail="密码必须包含字母和数字")
    try:
        result = account_service.change_password(account_id, data.old_password, data.new_password)
        if not result:
            raise HTTPException(status_code=404, detail="账号不存在")
        return {"message": "密码修改成功"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{account_id}/reset-password")
@limiter.limit("3/minute")
async def admin_reset_password(
    account_id: str,
    data: AdminResetPasswordRequest,
    request: StarletteRequest,
    manager_role: str = Depends(require_account_manager),
):
    """管理员重置密码（不需要旧密码，仅管理员可用）"""
    current_user_id = getattr(request.state, "user_id", "")
    if account_id == current_user_id:
        raise HTTPException(status_code=403, detail="不能通过此接口重置自己的密码，请使用密码修改功能")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="密码至少8位")
    if len(data.new_password) > 128:
        raise HTTPException(status_code=400, detail="密码最多128位")
    if not any(c.isalpha() for c in data.new_password) or not any(c.isdigit() for c in data.new_password):
        raise HTTPException(status_code=400, detail="密码必须包含字母和数字")
    target = account_service.get_account(account_id)
    if manager_role != "超级管理员" and target and (target.role == "超级管理员" or target.is_system):
        raise HTTPException(status_code=403, detail="只有超级管理员可以重置超级管理员账号密码")
    try:
        result = account_service.admin_reset_password(account_id, data.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"message": "密码重置成功"}


# ===== 在线设备 =====

@router.get("/sessions")
async def list_my_sessions(request: StarletteRequest):
    user_id = getattr(request.state, "user_id", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="未登录")
    sessions = session_service.list_account_sessions(user_id)
    return sessions


@router.delete("/sessions/{session_id}")
async def delete_my_session(session_id: str, request: StarletteRequest):
    user_id = getattr(request.state, "user_id", "")
    session = session_service.get_session(session_id)
    if not session or session.get("account_id") != user_id:
        raise HTTPException(status_code=404, detail="session 不存在")
    # 保护：目标是当前请求 token 的 jti 时拒绝，防止误踢自己正在使用的设备
    current_jti = getattr(request.state, "token_jti", "")
    if current_jti and session_id == current_jti:
        raise HTTPException(status_code=400, detail="不能退出当前登录设备")
    session_service.delete_session(session_id)
    return {"message": "已退出"}


# ===== 角色 =====

@router.get("/roles")
async def list_roles():
    return account_service.list_roles()


@router.post("/roles")
async def create_role(data: RoleCreate, _manager_role: str = Depends(require_account_manager)):
    # 仅管理员可新增角色
    return account_service.create_role(data)


@router.patch("/roles/{role_id}")
async def update_role(role_id: str, data: RoleUpdate, _manager_role: str = Depends(require_account_manager)):
    # 仅管理员可修改角色
    result = account_service.update_role(role_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="角色不存在")
    return result


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, _manager_role: str = Depends(require_account_manager)):
    # 仅管理员可删除角色
    if not account_service.delete_role(role_id):
        raise HTTPException(status_code=404, detail="角色不存在")
    return {"message": "已删除"}
