from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _get_client_ip(request: Request) -> str:
    """取真实客户端 IP：部署在可信反代之后，XFF 由反代覆写可防伪造，
    因此优先取 X-Forwarded-For 的第一个 IP；无该头时回退到直连地址。"""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


limiter = Limiter(key_func=_get_client_ip)
