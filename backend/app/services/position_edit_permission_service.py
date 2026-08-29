"""角色的信息编辑范围、客户数据范围与隐私操作权限。"""

from copy import deepcopy
from typing import Literal, TypedDict

from app.services.storage import delete_item, load_data, save_item

FILENAME = "position_edit_permissions.json"
EditArea = Literal["customers", "visits", "activities"]
EditScope = Literal["view", "own", "all"]
ContactField = Literal["phone", "wechat"]
ContactAction = Literal["view", "copy", "edit"]
CustomerScope = Literal["none", "related", "all"]
TransactionAccess = Literal["none", "summary", "detail"]


class ContactActionPermissions(TypedDict):
    view: bool
    copy: bool
    edit: bool


class ContactPermissions(TypedDict):
    phone: ContactActionPermissions
    wechat: ContactActionPermissions


class CustomerRelations(TypedDict):
    referrer: bool
    referrer_handler: bool


class SensitiveFieldPermissions(TypedDict):
    visit_purpose: bool
    trauma_history: bool
    current_block: bool
    work_info: bool
    other_info: bool


class CustomerDetailTabPermissions(TypedDict):
    follow_up: bool
    communication: bool
    activities: bool
    customer_followups: bool
    card_statistics: bool
    offline_courses: bool


class CustomerAccessPermissions(TypedDict):
    scope: CustomerScope
    relations: CustomerRelations
    sensitive_fields: SensitiveFieldPermissions
    detail_tabs: CustomerDetailTabPermissions
    transaction_access: TransactionAccess


class PositionEditPermissions(TypedDict):
    customers: EditScope
    visits: EditScope
    activities: EditScope
    contacts: ContactPermissions
    customer_access: CustomerAccessPermissions


def _empty_contact_permissions() -> ContactPermissions:
    return {
        "phone": {"view": False, "copy": False, "edit": False},
        "wechat": {"view": False, "copy": False, "edit": False},
    }


def _full_contact_permissions() -> ContactPermissions:
    return {
        "phone": {"view": True, "copy": True, "edit": True},
        "wechat": {"view": True, "copy": True, "edit": True},
    }


def _empty_customer_access() -> CustomerAccessPermissions:
    return {
        "scope": "none",
        "relations": {"referrer": False, "referrer_handler": False},
        "sensitive_fields": {
            "visit_purpose": False,
            "trauma_history": False,
            "current_block": False,
            "work_info": False,
            "other_info": False,
        },
        "detail_tabs": {
            "follow_up": False,
            "communication": False,
            "activities": False,
            "customer_followups": False,
            "card_statistics": False,
            "offline_courses": False,
        },
        "transaction_access": "none",
    }


def _full_customer_access() -> CustomerAccessPermissions:
    return {
        "scope": "all",
        "relations": {"referrer": True, "referrer_handler": True},
        "sensitive_fields": {
            "visit_purpose": True,
            "trauma_history": True,
            "current_block": True,
            "work_info": True,
            "other_info": True,
        },
        "detail_tabs": {
            "follow_up": True,
            "communication": True,
            "activities": True,
            "customer_followups": True,
            "card_statistics": True,
            "offline_courses": True,
        },
        "transaction_access": "detail",
    }


DEFAULT_PERMISSIONS: PositionEditPermissions = {
    # 兼容已有角色：客户资料在新增“仅浏览”权限前默认可编辑。
    "customers": "all",
    "visits": "own",
    "activities": "own",
    "contacts": _empty_contact_permissions(),
    "customer_access": _empty_customer_access(),
}
SUPER_ADMIN_PERMISSIONS: PositionEditPermissions = {
    "customers": "all",
    "visits": "all",
    "activities": "all",
    "contacts": _full_contact_permissions(),
    "customer_access": _full_customer_access(),
}

_permissions: dict[str, PositionEditPermissions] = {}


def _normalize_scope(value: object) -> EditScope:
    return value if value in {"view", "own", "all"} else "own"


def _normalize_customer_edit_scope(value: object) -> EditScope:
    # 客户资料不区分创建人；旧数据缺少此字段时保持可编辑。
    return "view" if value == "view" else "all"


def _normalize_contact_actions(value: object) -> ContactActionPermissions:
    raw = value if isinstance(value, dict) else {}
    return {
        "view": raw.get("view") is True,
        "copy": raw.get("copy") is True,
        "edit": raw.get("edit") is True,
    }


def _normalize_contacts(value: object) -> ContactPermissions:
    raw = value if isinstance(value, dict) else {}
    return {
        "phone": _normalize_contact_actions(raw.get("phone")),
        "wechat": _normalize_contact_actions(raw.get("wechat")),
    }


def _normalize_customer_access(value: object, *, legacy_default: bool = False) -> CustomerAccessPermissions:
    if not isinstance(value, dict):
        return _full_customer_access() if legacy_default else _empty_customer_access()
    relations = value.get("relations") if isinstance(value.get("relations"), dict) else {}
    sensitive = value.get("sensitive_fields") if isinstance(value.get("sensitive_fields"), dict) else {}
    tabs = value.get("detail_tabs") if isinstance(value.get("detail_tabs"), dict) else {}
    scope = value.get("scope")
    transaction_access = value.get("transaction_access")
    return {
        "scope": scope if scope in {"none", "related", "all"} else "none",
        "relations": {
            "referrer": relations.get("referrer") is True,
            "referrer_handler": relations.get("referrer_handler") is True,
        },
        "sensitive_fields": {
            "visit_purpose": sensitive.get("visit_purpose") is True,
            "trauma_history": sensitive.get("trauma_history") is True,
            "current_block": sensitive.get("current_block") is True,
            "work_info": sensitive.get("work_info") is True,
            "other_info": sensitive.get("other_info") is True,
        },
        "detail_tabs": {
            "follow_up": tabs.get("follow_up") is True,
            "communication": tabs.get("communication") is True,
            "activities": tabs.get("activities") is True,
            "customer_followups": tabs.get("customer_followups") is True,
            "card_statistics": tabs.get("card_statistics") is True,
            "offline_courses": tabs.get("offline_courses") is True,
        },
        "transaction_access": (
            transaction_access if transaction_access in {"none", "summary", "detail"} else "none"
        ),
    }


def _normalize_permissions(value: object) -> PositionEditPermissions:
    raw = value if isinstance(value, dict) else {}
    return {
        "customers": _normalize_customer_edit_scope(raw.get("customers")),
        "visits": _normalize_scope(raw.get("visits")),
        "activities": _normalize_scope(raw.get("activities")),
        "contacts": _normalize_contacts(raw.get("contacts")),
        # 兼容上线前的已有角色：旧数据没有 customer_access 时保留原来的完整可见能力。
        "customer_access": _normalize_customer_access(
            raw.get("customer_access"), legacy_default="customer_access" not in raw
        ),
    }


def _load() -> None:
    global _permissions
    raw = load_data(FILENAME) or {}
    _permissions = {
        position: _normalize_permissions(value)
        for position, value in raw.items()
    }


_load()


def get_permissions(position: str) -> PositionEditPermissions:
    if position == "超级管理员":
        return deepcopy(SUPER_ADMIN_PERMISSIONS)
    return deepcopy(_permissions.get(position, DEFAULT_PERMISSIONS))


def get_all() -> dict[str, PositionEditPermissions]:
    return {
        position: deepcopy(scopes)
        for position, scopes in _permissions.items()
    }


def set_permissions(position: str, permissions: object) -> PositionEditPermissions:
    normalized = (
        deepcopy(SUPER_ADMIN_PERMISSIONS)
        if position == "超级管理员"
        else _normalize_permissions(permissions)
    )
    _permissions[position] = normalized
    save_item(FILENAME, position, normalized)
    return deepcopy(normalized)


def has_all_edit(position: str, area: EditArea) -> bool:
    return get_permissions(position)[area] == "all"


def has_contact_permission(position: str, field: ContactField, action: ContactAction) -> bool:
    return get_permissions(position)["contacts"][field][action]


def rename_position_in_permissions(old_name: str, new_name: str) -> None:
    if old_name not in _permissions:
        return
    permissions = _permissions.pop(old_name)
    _permissions[new_name] = permissions
    save_item(FILENAME, new_name, permissions)
    delete_item(FILENAME, old_name)


def remove_position_from_permissions(position: str) -> None:
    if position not in _permissions:
        return
    _permissions.pop(position, None)
    delete_item(FILENAME, position)
