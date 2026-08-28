"""客户级数据范围、敏感字段与详情内容授权。"""

from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException

from app.services import position_edit_permission_service

SENSITIVE_FIELD_MAP = {
    "visit_purpose": ("tags",),
    "trauma_history": ("basic_info",),
    # PC 端历史上使用 assessment，小程序和语音录入使用 core_situation，必须作为同一项保护。
    "current_block": ("assessment", "core_situation"),
    "work_info": ("work_status", "work_description"),
    "other_info": ("other_info",),
}


def actor_name(request: Any) -> str:
    return (
        getattr(request.state, "user_owner", "")
        or getattr(request.state, "user_name", "")
        or ""
    ).strip()


def role_name(request: Any) -> str:
    return (getattr(request.state, "user_role", "") or "").strip()


def get_customer_permissions(role: str) -> dict:
    return position_edit_permission_service.get_permissions(role)["customer_access"]


def can_view_customer(role: str, owner_name: str, customer: Any) -> bool:
    if role == "超级管理员":
        return True
    permissions = get_customer_permissions(role)
    scope = permissions["scope"]
    if scope == "all":
        return True
    if scope != "related" or not owner_name:
        return False

    owner = owner_name.strip()
    relations = permissions["relations"]
    if relations["referrer"] and (getattr(customer, "referrer", "") or "").strip() == owner:
        return True
    if relations["referrer_handler"] and (getattr(customer, "referrer_handler", "") or "").strip() == owner:
        return True
    return False


def can_view_customer_for_request(request: Any, customer: Any) -> bool:
    return can_view_customer(role_name(request), actor_name(request), customer)


def filter_customers(request: Any, customers: Iterable[Any]) -> list[Any]:
    role = role_name(request)
    owner = actor_name(request)
    return [customer for customer in customers if can_view_customer(role, owner, customer)]


def visible_customer_ids(request: Any, customers: Iterable[Any]) -> set[str]:
    return {
        customer.id
        for customer in filter_customers(request, customers)
        if getattr(customer, "id", "")
    }


def protect_sensitive_data(data: dict, role: str) -> dict:
    protected = dict(data)
    permissions = get_customer_permissions(role)
    for permission_key, field_names in SENSITIVE_FIELD_MAP.items():
        if permissions["sensitive_fields"][permission_key]:
            continue
        for field_name in field_names:
            protected[field_name] = ""
    return protected


def sensitive_permission_for_field(field_name: str) -> str | None:
    for permission_key, field_names in SENSITIVE_FIELD_MAP.items():
        if field_name in field_names:
            return permission_key
    return None


def can_view_sensitive_field(role: str, field_name: str) -> bool:
    permission_key = sensitive_permission_for_field(field_name)
    if permission_key is None:
        return True
    return get_customer_permissions(role)["sensitive_fields"][permission_key]


def can_view_detail_tab(role: str, tab: str) -> bool:
    permissions = get_customer_permissions(role)
    if tab == "transactions":
        return permissions["transaction_access"] == "detail"
    return permissions["detail_tabs"].get(tab) is True


def transaction_access(role: str) -> str:
    return get_customer_permissions(role)["transaction_access"]


def can_view_transaction_summary(role: str) -> bool:
    return transaction_access(role) in {"summary", "detail"}


def require_transaction_access(request: Any, *, detail: bool = False) -> str:
    role = role_name(request)
    access = transaction_access(role)
    if access == "none" or (detail and access != "detail"):
        message = "没有查看交易明细的权限" if detail else "没有查看交易数据的权限"
        raise HTTPException(status_code=403, detail=message)
    return access


def require_customer_scope(request: Any, customer_id: str, *, action: str = "查看") -> Any:
    """校验当前账号能否操作指定客户；历史交易允许匹配已停用客户。"""
    from app.services import customer_service

    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    if not can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail=f"没有{action}该客户资料的权限")
    return customer


def filter_record_dicts(request: Any, items: Iterable[dict]) -> list[dict]:
    from app.services import customer_service

    visible_ids = visible_customer_ids(request, customer_service.list_all_customers())
    return [item for item in items if item.get("customer_id") in visible_ids]


def filter_customer_search_results(request: Any, items: Iterable[dict]) -> list[dict]:
    """过滤各业务页的客户选择器结果，避免通过搜索绕过客户可见范围。"""
    from app.services import customer_service

    allowed_ids = visible_customer_ids(request, customer_service.list_all_customers())
    return [item for item in items if item.get("id") in allowed_ids]


def require_new_customer_ids(
    request: Any,
    submitted_ids: Iterable[str],
    *,
    existing_ids: Iterable[str] = (),
    action: str = "关联",
) -> None:
    """只校验本次新增的客户关联；保留历史不可见关联，避免普通编辑误删旧数据。"""
    from app.services import customer_service

    allowed_ids = visible_customer_ids(request, customer_service.list_all_customers())
    existing = {customer_id for customer_id in existing_ids if customer_id}
    added_ids = {
        customer_id
        for customer_id in submitted_ids
        if customer_id and customer_id not in existing
    }
    if not added_ids.issubset(allowed_ids):
        raise HTTPException(status_code=403, detail=f"只能{action}可见范围内的客户")
