"""客户级数据范围、敏感字段与详情内容授权。"""

from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException

from app.models.customer import customer_referrers
from app.services import position_edit_permission_service
from app.utils.request_roles import get_request_roles, normalize_roles

SENSITIVE_FIELD_MAP = {
    "visit_purpose": ("tags",),
    "trauma_history": ("basic_info",),
    # PC 端历史上使用 assessment，小程序和语音录入使用 core_situation，必须作为同一项保护。
    "current_block": ("assessment", "core_situation"),
    "work_info": ("work_status", "work_description", "income_stability", "personal_annual_income", "household_annual_income"),
    "other_info": ("other_info",),
}

NOTE_PERMISSION_KEYS = ("visit_need_tags", "visit_need_detail", "customer_info", "follow_up", "customer_feedback")
NOTE_FIELD_MAP = {"needs": "visit_need", "feedback": "customer_info", "healing_notes": "follow_up", "experience": "customer_feedback",
                  "customer_info": "customer_info", "visit_need": "visit_need", "follow_up": "follow_up",
                  "customer_feedback": "customer_feedback"}


def _note_access(roles, permissions):
    value = permissions if permissions is not None else get_customer_permissions(roles)
    return position_edit_permission_service._normalize_customer_access(value)


def can_view_note(roles, category: str, *, permissions=None) -> bool:
    tabs = _note_access(roles, permissions)["detail_tabs"]
    if category == "visit_need":
        return tabs.get("visit_need_tags", False) or tabs.get("visit_need_detail", False)
    return tabs.get(category, False) is True


def can_view_any_note(roles=(), *, permissions=None) -> bool:
    tabs = _note_access(roles, permissions)["detail_tabs"]
    return any(tabs.get(key) for key in NOTE_PERMISSION_KEYS)


def protect_note(note, roles=(), *, permissions=None):
    """返回脱敏副本；标签和文字独立控制，绝不修改原始记录。"""
    access = _note_access(roles, permissions)
    category = note.get("category") if isinstance(note, dict) else note.category
    if not can_view_note(roles, category, permissions=access):
        return None
    hidden = {}
    if category == "visit_need":
        if not access["detail_tabs"].get("visit_need_tags"):
            hidden["need_tags"] = []
        if not access["detail_tabs"].get("visit_need_detail"):
            hidden["content"] = ""
        if isinstance(note, dict) and "detail_content" in note:
            from app.services import visit_note_service
            hidden["detail_content"] = note["detail_content"] if access["detail_tabs"].get("visit_need_detail") else ""
            hidden["content"] = visit_note_service.display_content_dict({
                "content": hidden["detail_content"],
                "need_tags": note.get("need_tags", []) if access["detail_tabs"].get("visit_need_tags") else [],
            })
    return {**note, **hidden} if isinstance(note, dict) else note.model_copy(update=hidden)


def protect_note_fields(data: dict, roles=(), *, permissions=None) -> dict:
    """兼容汇总文字与备注明细；所有入口共享相同字段权限。"""
    access = _note_access(roles, permissions)
    result = dict(data)
    for field, category in NOTE_FIELD_MAP.items():
        if field in result and not can_view_note(roles, category, permissions=access):
            result[field] = ""
    # 来访需求汇总混合标签和文字，必须由已过滤的备注重新生成。
    if "visit_notes" in result:
        notes = [visible for note in result["visit_notes"] if (visible := protect_note(note, permissions=access)) is not None]
        result["visit_notes"] = notes
        from app.services import visit_note_service
        result["needs"] = "\n".join(
            f"{note.get('feedback_person') or note.get('created_by') or '历史记录'}：{visit_note_service.display_content_dict(note)}"
            for note in notes if note["category"] == "visit_need" and visit_note_service.display_content_dict(note))
    elif not access["detail_tabs"].get("visit_need_detail") and "needs" in result:
        result["needs"] = ""
    if not access["detail_tabs"].get("visit_need_detail") and "visit_need" in result and "visit_need_entries" not in result:
        result["visit_need"] = ""
    return result


def protect_note_payload(data, roles=(), *, permissions=None):
    """过滤课程、报表和导出的嵌套汇总；共享字段映射避免各入口自行脱敏。"""
    access = _note_access(roles, permissions)
    if isinstance(data, list):
        return [visible for item in data if (visible := protect_note_payload(item, permissions=access)) is not None]
    if not isinstance(data, dict):
        return data
    if data.get("category") in {"visit_need", "customer_info", "follow_up", "customer_feedback"} and "content" in data:
        return protect_note(data, permissions=access)
    result = {key: protect_note_payload(value, permissions=access) for key, value in data.items()}
    result = protect_note_fields(result, permissions=access)
    for category in ("visit_need", "customer_info", "follow_up", "customer_feedback"):
        allowed = can_view_note(roles, category, permissions=access)
        entry_key = f"{category}_entries"
        if entry_key in data:
            result[entry_key] = [visible for entry in data[entry_key] or []
                                 if (visible := protect_note({**entry, "category": category}, permissions=access)) is not None]
            for entry in result[entry_key]:
                entry.pop("category", None)
            result[category] = "\n".join(entry.get("content", "") for entry in result[entry_key])
        for key in data:
            if key.startswith(f"latest_{category}_") or key == f"daily_{category}" or key == f"{category}_creators":
                if not allowed:
                    result[key] = ""
        if category == "visit_need" and not access["detail_tabs"].get("visit_need_detail"):
            for key in ("daily_need", "daily_visit_need"):
                if key in result:
                    result[key] = ""
    if "columns" in result:
        result["columns"] = [column for column in result["columns"]
                             if column.get("key") not in ("visit_need", "customer_info", "follow_up", "customer_feedback")
                             or can_view_note(roles, column["key"], permissions=access)]
    return result


def require_note_access(request, category: str) -> None:
    if not can_view_note(get_request_roles(request), category):
        raise HTTPException(403, "没有查看该类信息的权限")


def prepare_note_write(request, data, category: str, existing=None):
    """部分查看权限编辑需求时保留不可见部分，防止空文本覆盖隐藏内容。"""
    roles = get_request_roles(request)
    require_note_access(request, category)
    if category != "visit_need":
        return data
    tabs = get_customer_permissions(roles)["detail_tabs"]
    updates = {}
    if not tabs["visit_need_detail"]:
        if data.content.strip():
            raise HTTPException(403, "没有来访需求详情的查看权限")
        updates["content"] = existing.content if existing else ""
    if not tabs["visit_need_tags"]:
        if data.need_tag_ids:
            raise HTTPException(403, "没有来访需求标签的查看权限")
        updates["need_tag_ids"] = None
    return data.model_copy(update=updates)


def actor_name(request: Any) -> str:
    return (
        getattr(request.state, "user_owner", "")
        or getattr(request.state, "user_name", "")
        or ""
    ).strip()


def role_name(request: Any) -> str:
    return (getattr(request.state, "user_role", "") or "").strip()


def get_customer_permissions(role: str | Iterable[str]) -> dict:
    return position_edit_permission_service.get_permissions(role).get("customer_access", position_edit_permission_service.DEFAULT_PERMISSIONS["customer_access"])


def can_view_customer(role: str | Iterable[str], owner_name: str, customer: Any) -> bool:
    roles = normalize_roles(role)
    if "超级管理员" in roles:
        return True
    permissions = get_customer_permissions(roles)
    scope = permissions["scope"]
    if scope == "all":
        return True
    if scope != "related" or not owner_name:
        return False

    owner = owner_name.strip()
    relations = permissions["relations"]
    # 仅自己引流、仅自己承接都要能看到本人这条客户资料，不要求本人同时是自己的引流人或承接人。
    if (relations["referrer"] or relations["referrer_handler"]) and _is_account_owner(owner, customer):
        return True
    if relations["referrer"] and owner in customer_referrers(customer):
        return True
    if relations["referrer_handler"] and (getattr(customer, "referrer_handler", "") or "").strip() == owner:
        return True
    return False


def _is_account_owner(owner: str, customer: Any) -> bool:
    names = {
        (getattr(customer, "nickname", "") or "").strip(),
        (getattr(customer, "name", "") or "").strip(),
    }
    return owner in names


def can_view_customer_for_request(request: Any, customer: Any) -> bool:
    return can_view_customer(get_request_roles(request), actor_name(request), customer)


def filter_customers(request: Any, customers: Iterable[Any]) -> list[Any]:
    role = get_request_roles(request)
    owner = actor_name(request)
    return [customer for customer in customers if can_view_customer(role, owner, customer)]


def visible_customer_ids(request: Any, customers: Iterable[Any]) -> set[str]:
    return {
        customer.id
        for customer in filter_customers(request, customers)
        if getattr(customer, "id", "")
    }


def protect_sensitive_data(data: dict, role: str | Iterable[str]) -> dict:
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


def can_view_sensitive_field(role: str | Iterable[str], field_name: str) -> bool:
    permission_key = sensitive_permission_for_field(field_name)
    if permission_key is None:
        return True
    return get_customer_permissions(role)["sensitive_fields"][permission_key]


def can_view_detail_tab(role: str | Iterable[str], tab: str) -> bool:
    permissions = get_customer_permissions(role)
    if tab == "transactions":
        return permissions["transaction_access"] == "detail"
    return permissions["detail_tabs"].get(tab) is True


def transaction_access(role: str | Iterable[str]) -> str:
    return get_customer_permissions(role)["transaction_access"]


def can_view_transaction_summary(role: str | Iterable[str]) -> bool:
    return transaction_access(role) in {"summary", "detail"}


def require_transaction_access(request: Any, *, detail: bool = False) -> str:
    role = get_request_roles(request)
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
