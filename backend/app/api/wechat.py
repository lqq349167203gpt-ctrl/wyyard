from fastapi import APIRouter, HTTPException, Request
from app.models.base import StrictBaseModel

from app.config.settings import settings
from app.services import account_service, wechat_service, position_permission_service, position_customer_permission_service, customer_service
from app.api.accounts import ALL_PAGE_KEYS

router = APIRouter(prefix="/api/wechat", tags=["wechat"])


class WechatLoginRequest(StrictBaseModel):
    code: str


class WechatBindRequest(StrictBaseModel):
    token: str
    username: str
    password: str


def _build_login_response(account) -> dict:
    """构建与 accounts/login 相同格式的响应"""
    account_data = account.model_dump()
    account_data.pop("password", None)

    if account.role == "超级管理员":
        from app.services import member_identity_service
        all_identities = [i.name for i in member_identity_service.list_identities()]
        return {
            "account": account_data,
            "permissions": ALL_PAGE_KEYS,
            "customer_permissions": all_identities,
            "customer_permissions_class_records": all_identities,
            "customer_permissions_payment": all_identities,
        }

    permissions = position_permission_service.get_permissions(account.role)
    return {
        "account": account_data,
        "permissions": permissions,
        "customer_permissions": position_customer_permission_service.get_customer_permissions("customers", account.role),
        "customer_permissions_class_records": position_customer_permission_service.get_customer_permissions("class_records", account.role),
        "customer_permissions_payment": position_customer_permission_service.get_customer_permissions("payment", account.role),
    }


def _make_jwt_token(account) -> str:
    """为账号生成 JWT token（与 accounts/login 一致，全局中间件只认 JWT）"""
    from app.middleware.jwt_auth import create_access_token
    from app.services import session_service
    import uuid
    token = create_access_token(
        account_id=account.id,
        username=account.username,
        owner=account.owner or "",
        role=account.role,
    )
    # 解码获取 jti，写入 session 表（改密码时可批量失效）
    from app.middleware.jwt_auth import decode_token
    payload = decode_token(token)
    session_service.create_session(session_id=payload.get("jti", str(uuid.uuid4())), account_id=account.id)
    return token


@router.post("/login")
async def wechat_login(data: WechatLoginRequest):
    """微信登录：用 code 换 openid，查找已绑定的账号"""
    try:
        wx_result = wechat_service.jscode2session(data.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    openid = wx_result.get("openid")
    if not openid:
        raise HTTPException(status_code=400, detail="微信登录失败：未获取到 openid")

    # 查找已绑定的 session
    existing = wechat_service.find_session_by_openid(openid)
    if existing:
        account = account_service.get_account(existing.account_id)
        if account and account.enabled:
            resp = _build_login_response(account)
            resp["token"] = _make_jwt_token(account)
            resp["bound"] = True
            return resp

    # 未绑定，返回临时 token
    temp_session = wechat_service.create_session(openid, "")
    return {
        "token": temp_session.token,
        "openid": openid,
        "bound": False,
    }


@router.post("/bind")
async def wechat_bind(data: WechatBindRequest):
    """绑定微信账号：验证用户名密码，将 openid 关联到账号"""
    # 验证 token 存在且未过期
    from app.services.wechat_service import _sessions
    session = _sessions.get(data.token)
    if not session:
        raise HTTPException(status_code=400, detail="token 无效或已过期")

    # 如果已绑定其他账号，不允许重复绑定
    if session.account_id:
        raise HTTPException(status_code=400, detail="该 token 已绑定账号")

    # 验证用户名密码
    account = account_service.login(data.username, data.password)
    if not account:
        raise HTTPException(status_code=401, detail="账号或密码错误")

    # 绑定
    session.account_id = account.id
    from app.services.wechat_service import _save_session
    _save_session(data.token)

    resp = _build_login_response(account)
    resp["token"] = _make_jwt_token(account)
    resp["bound"] = True
    return resp


class DevLoginRequest(StrictBaseModel):
    username: str


@router.post("/dev-login")
async def dev_login(data: DevLoginRequest, request: Request):
    """开发环境登录：直接用用户名登录，不需要密码（仅 debug 模式可用）"""
    if not settings.debug:
        raise HTTPException(status_code=404, detail="Not found")
    # 仅允许本地/局域网访问
    client_ip = request.client.host if request.client else ""
    if client_ip not in ("127.0.0.1", "::1", "localhost") and not client_ip.startswith("192.168."):
        raise HTTPException(status_code=403, detail="仅允许本地访问")
    account = account_service.get_by_username(data.username)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    if not account.enabled:
        raise HTTPException(status_code=403, detail="账号已禁用")
    # 生成 JWT（与 accounts/login 一致），而非 UUID session
    from app.middleware.jwt_auth import create_access_token
    token = create_access_token(
        account_id=account.id,
        username=account.username,
        owner=account.owner or "",
        role=account.role,
    )
    resp = _build_login_response(account)
    resp["token"] = token
    resp["bound"] = True
    return resp


class PhoneLoginRequest(StrictBaseModel):
    code: str  # wx.getPhoneNumber 返回的 code


@router.post("/phone-login")
async def phone_login(data: PhoneLoginRequest):
    """手机号自动登录（员工）：解密手机号 → 查客户 → 查账号"""
    try:
        phone = wechat_service.get_phone_number(data.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not phone:
        raise HTTPException(status_code=400, detail="未获取到手机号")

    # 按手机号查找客户
    customer = customer_service.get_by_phone(phone)
    if not customer:
        raise HTTPException(status_code=403, detail="该手机号未注册客户，无访问权限")

    # 按客户姓名查找后台账号
    account = account_service.get_by_owner(customer.nickname) or account_service.get_by_owner(customer.name)
    if not account:
        raise HTTPException(status_code=403, detail="该客户未开通后台账号，无访问权限")

    # 创建 session
    wechat_service.create_session("", account.id)

    resp = _build_login_response(account)
    resp["token"] = _make_jwt_token(account)
    resp["bound"] = True
    return resp


@router.post("/customer-login")
async def customer_login(data: PhoneLoginRequest):
    """客户手机号登录：解密手机号 → 查客户 → 生成客户专属 JWT（无需后台账号）"""
    try:
        phone = wechat_service.get_phone_number(data.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not phone:
        raise HTTPException(status_code=400, detail="未获取到手机号")

    customer = customer_service.get_by_phone(phone)
    if not customer:
        raise HTTPException(status_code=403, detail="该手机号未注册客户")

    from app.middleware.jwt_auth import create_customer_token
    token = create_customer_token(customer_id=customer.id, nickname=customer.nickname)

    return {
        "token": token,
        "role": "customer",
        "customer": {
            "id": customer.id,
            "nickname": customer.nickname,
            "name": customer.name,
            "member_type": customer.member_type,
        },
    }
