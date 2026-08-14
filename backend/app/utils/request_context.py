from starlette.requests import Request


def get_client_ip(request: Request) -> str:
    """获取用于审计展示的客户端 IP，兼容 Nginx/负载均衡转发。"""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else ""


def get_client_source(request: Request, default: str = "pc") -> str:
    source = request.headers.get("x-client-type", "").strip()
    return source if source in {"pc", "miniprogram", "miniprogram-client", "system"} else default
