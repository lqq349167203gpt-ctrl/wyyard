from fastapi import APIRouter, HTTPException, Request

from app.api.accounts import ALL_PAGE_KEYS
from app.config.settings import settings
from app.models.base import StrictBaseModel
from app.services import (
    account_service,
    customer_service,
    login_record_service,
    position_edit_permission_service,
    position_permission_service,
    wechat_service,
)
from app.utils.request_context import get_client_ip, get_client_source

router = APIRouter(prefix="/api/wechat", tags=["wechat"])


class WechatLoginRequest(StrictBaseModel):
    code: str
    member_only: bool = False


class WechatBindRequest(StrictBaseModel):
    token: str
    username: str
    password: str


def _build_login_response(account) -> dict:
    """构建与 accounts/login 相同格式的响应"""
    account_data = account.model_dump()
    account_data.pop("password", None)

    account_roles = account_service.normalize_roles(account.roles, account.role)
    if "超级管理员" in account_roles:
        return {
            "account": account_data,
            "permissions": ALL_PAGE_KEYS,
            "edit_permissions": position_edit_permission_service.get_permissions(account_roles),
        }

    permissions = position_permission_service.get_permissions(account_roles)
    return {
        "account": account_data,
        "permissions": permissions,
        "edit_permissions": position_edit_permission_service.get_permissions(account_roles),
    }


def _make_jwt_token(account, request: Request) -> str:
    """为账号生成 JWT token（与 accounts/login 一致，全局中间件只认 JWT）"""
    import uuid

    from app.middleware.jwt_auth import create_access_token
    from app.services import session_service
    token = create_access_token(
        account_id=account.id,
        username=account.username,
        owner=account.owner or "",
        role=account.role,
    )
    # 解码获取 jti，写入 session 表（改密码时可批量失效）
    from app.middleware.jwt_auth import decode_token
    payload = decode_token(token)
    ip = get_client_ip(request)
    user_agent = request.headers.get("user-agent", "")
    session_service.create_session(
        session_id=payload.get("jti", str(uuid.uuid4())),
        account_id=account.id,
        device_info=user_agent,
        ip=ip,
        device_id=request.headers.get("x-device-id", ""),
    )
    login_record_service.record_login(
        account,
        source=get_client_source(request, "miniprogram"),
        ip=ip,
        device_info=user_agent,
    )
    return token


@router.post("/login")
async def wechat_login(data: WechatLoginRequest, request: Request):
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
        if data.member_only:
            from app.services import staff_member_service

            customer_id = getattr(existing, "customer_id", "")
            customer = (customer_service.get_customer(customer_id) if customer_id
                        else staff_member_service.resolve_customer(existing.account_id) if existing.account_id else None)
            if customer and not customer.is_deleted and customer.phone and staff_member_service.customer_for_phone(customer.phone):
                return _member_login_response(customer)
        account = account_service.get_account(existing.account_id)
        if account and account.enabled:
            resp = _build_login_response(account)
            resp["token"] = _make_jwt_token(account, request)
            resp["bound"] = True
            return resp
        if getattr(existing, "customer_id", ""):
            from app.services import staff_member_service

            customer = customer_service.get_customer(existing.customer_id)
            if customer and not customer.is_deleted and customer.phone and staff_member_service.customer_for_phone(customer.phone):
                account = staff_member_service.management_account_for(customer)
                if account:
                    resp = _build_login_response(account)
                    resp.update(token=_make_jwt_token(account, request), bound=True)
                    return resp
                return _member_login_response(customer)

    # 未绑定，返回临时 token
    temp_session = wechat_service.create_session(openid, "")
    return {
        "token": temp_session.token,
        "openid": openid,
        "bound": False,
    }


@router.post("/bind")
async def wechat_bind(data: WechatBindRequest, request: Request):
    """绑定微信账号：验证用户名密码，将 openid 关联到账号"""
    # 验证 token 存在且未过期（直查数据库，多实例下立即可见）
    session = wechat_service.get_session(data.token)
    if not session:
        raise HTTPException(status_code=400, detail="token 无效或已过期")

    # 如果已绑定其他账号，不允许重复绑定
    if session.account_id:
        raise HTTPException(status_code=400, detail="该 token 已绑定账号")

    # 验证用户名密码
    account = account_service.login(data.username, data.password)
    if not account:
        raise HTTPException(status_code=401, detail="账号或密码错误")

    # 绑定（写穿到数据库）
    session.account_id = account.id
    wechat_service.save_session(session)

    resp = _build_login_response(account)
    resp["token"] = _make_jwt_token(account, request)
    resp["bound"] = True
    return resp


class DevLoginRequest(StrictBaseModel):
    username: str


@router.post("/dev-login")
async def dev_login(data: DevLoginRequest, request: Request):
    """开发环境登录：直接用用户名登录，不需要密码（需 debug 且显式开启 enable_dev_login）"""
    # 双闸：反代后客户端 IP 恒为 127.0.0.1，仅靠 debug 配置防线过薄，
    # 必须同时显式开启 ENABLE_DEV_LOGIN 才暴露此端点，否则按 404 隐藏
    if not (settings.debug and settings.enable_dev_login):
        raise HTTPException(status_code=404, detail="Not found")
    # 保留原 IP 白名单作为额外一层（仅在本机/无反代直连时有效）
    client_ip = request.client.host if request.client else ""
    if client_ip not in ("127.0.0.1", "::1", "localhost") and not client_ip.startswith("192.168."):
        raise HTTPException(status_code=403, detail="仅允许本地访问")
    account = account_service.get_by_username(data.username)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    if not account.enabled:
        raise HTTPException(status_code=403, detail="账号已禁用")
    # 与正式登录共用同一套 JWT + session 登记逻辑，
    # 否则中间件会将未登记的 jti 判定为无效会话。
    token = _make_jwt_token(account, request)
    resp = _build_login_response(account)
    resp["token"] = token
    resp["bound"] = True
    return resp


class PhoneLoginRequest(StrictBaseModel):
    code: str  # wx.getPhoneNumber 返回的 code
    avatar_url: str = ""


class EntryLoginRequest(StrictBaseModel):
    code: str
    login_code: str


def _member_login_response(customer):
    from app.middleware.jwt_auth import create_customer_token

    return {"token": create_customer_token(customer.id, customer.nickname or customer.name),
            "role": "customer", "bound": True, "permissions": [],
            "customer": {"id": customer.id, "nickname": customer.nickname or customer.name,
                         "member_type": customer.member_type, "card_status": getattr(customer, "card_status", ""), "card_status_tone": getattr(customer, "card_status_tone", "neutral")}}


@router.post("/entry-login")
async def entry_login(data: EntryLoginRequest, request: Request):
    """管理小程序的统一手机号入口：管理账号优先，否则进入本人会员视图。"""
    from app.services import staff_member_service

    try:
        phone = wechat_service.get_phone_number(data.code, management=True)
        wx_result = wechat_service.jscode2session(data.login_code)
    except ValueError as error:
        raise HTTPException(400, str(error))
    openid = wx_result.get("openid")
    if not openid:
        raise HTTPException(400, "微信登录失败：未获取到 openid")
    customer = staff_member_service.customer_for_phone(phone)
    if not customer:
        raise HTTPException(403, staff_member_service.UNBOUND_MESSAGE)
    account = staff_member_service.management_account_for(customer)
    # 同一微信只保留当前经手机号验证的归属，避免旧绑定优先覆盖新身份。
    session = wechat_service.find_session_by_openid(openid)
    if not session:
        session = wechat_service.create_session(openid, account.id if account else "")
    session.account_id = account.id if account else ""
    session.customer_id = customer.id
    wechat_service.save_session(session)
    if account:
        resp = _build_login_response(account)
        resp.update(token=_make_jwt_token(account, request), bound=True)
        return resp
    return _member_login_response(customer)


@router.post("/phone-login")
async def phone_login(data: PhoneLoginRequest, request: Request):
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
    resp["token"] = _make_jwt_token(account, request)
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

    # 保存头像（如有）
    if data.avatar_url and data.avatar_url != customer.avatar_url:
        from app.models.customer import CustomerUpdate
        customer_service.update_customer(customer.id, CustomerUpdate(avatar_url=data.avatar_url))

    from app.middleware.jwt_auth import create_customer_token
    token = create_customer_token(customer_id=customer.id, nickname=customer.nickname)

    return {
        "token": token,
        "role": "customer",
        "customer": {
            "id": customer.id,
            "nickname": customer.nickname,
            "name": customer.name,
            "member_type": customer.member_type, "card_status": getattr(customer, "card_status", ""), "card_status_tone": getattr(customer, "card_status_tone", "neutral"),
        },
    }
