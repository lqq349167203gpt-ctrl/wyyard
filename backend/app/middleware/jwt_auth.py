import time
import uuid

import jwt
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config.settings import settings

SKIP_PATHS = (
    "/api/health",
    "/api/accounts/login",
    "/api/wechat/",
)

# 仅 GET 公开的路径前缀（不需要 token 即可访问）
PUBLIC_GET_PATHS = (
    "/api/client/activities",
)

# 客户角色可访问的路径前缀
CUSTOMER_ALLOWED_PATHS = (
    "/api/class-records/unified",
    "/api/class-records/dashboard",
    "/api/class-records/calendar-counts",
    "/api/customer-detail/",
    "/api/activity-registrations",
    "/api/spaces",
    "/api/course-types",
    "/api/client/",
)

# 需要管理员权限的路径前缀（POST/PUT/PATCH/DELETE 自动拦截非管理员）
ADMIN_PATHS = (
    "/api/ai-configs",
    "/api/agents",
    "/api/uploads",
)

JWT_ISSUER = "wyyard-backend"
JWT_AUDIENCE = "wyyard-frontend"


def create_access_token(account_id: str, username: str, owner: str, role: str) -> str:
    now = int(time.time())
    payload = {
        "sub": account_id,
        "username": username,
        "owner": owner,
        "role": role,
        "iat": now,
        "nbf": now,
        "exp": now + settings.jwt_expire_hours * 3600,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_customer_token(customer_id: str, nickname: str) -> str:
    """为客户生成专属 JWT（role=customer，无需后台账号）"""
    now = int(time.time())
    payload = {
        "sub": customer_id,
        "username": nickname,
        "owner": "",
        "role": "customer",
        "customer_id": customer_id,
        "iat": now,
        "nbf": now,
        "exp": now + settings.jwt_expire_hours * 3600,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        issuer=JWT_ISSUER,
        audience=JWT_AUDIENCE,
    )


def _json_response(status_code: int, detail: str):
    return JSONResponse({"detail": detail}, status_code=status_code)


def _parse_auth_header(scope) -> str:
    """从 ASGI scope 中提取 Bearer token，不消费 body"""
    for key, value in scope.get("headers", []):
        if key == b"authorization":
            auth = value.decode("utf-8", errors="ignore")
            if auth.startswith("Bearer "):
                return auth[7:]
    return ""


class AuthMiddleware:
    """纯 ASGI 认证中间件 — 只检查 header，不消费 request body，不破坏 SSE/streaming"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        for skip in SKIP_PATHS:
            if path == skip or path.startswith(skip):
                await self.app(scope, receive, send)
                return

        # GET 公开端点（活动列表/详情，无需 token）
        if method == "GET":
            for public in PUBLIC_GET_PATHS:
                if path == public or path.startswith(public + "/"):
                    await self.app(scope, receive, send)
                    return

        token = _parse_auth_header(scope)
        if token:
            try:
                payload = decode_token(token)
                role = payload.get("role", "")

                # 客户角色：只允许访问白名单接口
                if role == "customer":
                    customer_id = payload.get("customer_id", payload.get("sub", ""))
                    allowed = any(path == p or path.startswith(p) for p in CUSTOMER_ALLOWED_PATHS)
                    if not allowed:
                        response = _json_response(403, "权限不足")
                        await response(scope, receive, send)
                        return
                    state = scope.setdefault("state", {})
                    state["user_id"] = customer_id
                    state["user_name"] = payload.get("username", "")
                    state["user_owner"] = ""
                    state["user_role"] = "customer"
                    state["customer_id"] = customer_id
                    await self.app(scope, receive, send)
                    return

                # 员工角色：正常校验账号
                account_id = payload.get("sub", "")
                from app.services import account_service
                account = account_service.get_account(account_id)
                if not account or not account.enabled:
                    response = _json_response(401, "认证无效")
                    await response(scope, receive, send)
                    return
                # 改密码后旧 token 失效：token.iat 必须晚于 password_changed_at
                if account.password_changed_at:
                    token_iat = payload.get("iat", 0)
                    pwd_changed = int(account.password_changed_at.timestamp())
                    if token_iat < pwd_changed:
                        response = _json_response(401, "认证无效")
                        await response(scope, receive, send)
                        return
                # session 校验：密码修改后清除 session，旧 token 自动失效
                jti = payload.get("jti", "")
                if jti:
                    from app.services import session_service
                    session = session_service.get_session(jti)
                    # session 被主动删除（密码修改/踢出）才拦截，无 session 记录不拦截（兼容旧 token）
                    if session is None and session_service.has_account_sessions(account_id):
                        response = _json_response(401, "认证无效")
                        await response(scope, receive, send)
                        return
                # 设置 request.state（通过 scope["state"]）
                state = scope.setdefault("state", {})
                state["user_id"] = account.id
                state["user_name"] = account.username
                state["user_owner"] = account.owner or ""
                state["user_role"] = account.role

                # 路径级授权：管理员路径的写操作拦截非管理员
                method = scope.get("method", "")
                if method in ("POST", "PUT", "PATCH", "DELETE"):
                    for admin_path in ADMIN_PATHS:
                        if (path == admin_path or path.startswith(admin_path + "/")) and account.role != "超级管理员":
                            response = _json_response(403, "权限不足")
                            await response(scope, receive, send)
                            return

                await self.app(scope, receive, send)
                return
            except jwt.ExpiredSignatureError:
                response = _json_response(401, "认证无效")
                await response(scope, receive, send)
                return
            except jwt.InvalidTokenError:
                response = _json_response(401, "认证无效")
                await response(scope, receive, send)
                return

        response = _json_response(401, "认证无效")
        await response(scope, receive, send)


def require_role(*roles: str):
    """FastAPI 依赖：要求当前用户具有指定角色之一"""
    def dependency(request: Request):
        user_role = getattr(request.state, "user_role", "")
        if user_role not in roles:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="权限不足")
        return user_role
    return dependency


def require_admin(request: Request):
    """FastAPI 依赖：要求超级管理员角色"""
    user_role = getattr(request.state, "user_role", "")
    if user_role != "超级管理员":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="权限不足")
    return user_role
