"""统一读取请求账号的多角色信息。"""

from collections.abc import Iterable
from typing import Any


def normalize_roles(value: str | Iterable[str] | None, fallback: str = "") -> list[str]:
    if isinstance(value, str):
        candidates = [value]
    elif value is None:
        candidates = []
    else:
        candidates = list(value)
    if fallback:
        candidates.append(fallback)

    result: list[str] = []
    for item in candidates:
        name = str(item or "").strip()
        if name and name not in result:
            result.append(name)
    if "超级管理员" in result:
        result.remove("超级管理员")
        result.insert(0, "超级管理员")
    return result


def get_request_roles(request: Any) -> list[str]:
    roles = getattr(request.state, "user_roles", None)
    primary = str(getattr(request.state, "user_role", "") or "")
    return normalize_roles(roles, primary)


def has_request_role(request: Any, role: str) -> bool:
    return role in get_request_roles(request)


def primary_request_role(request: Any) -> str:
    roles = get_request_roles(request)
    return roles[0] if roles else ""
