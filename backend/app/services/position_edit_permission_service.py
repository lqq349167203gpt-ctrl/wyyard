"""角色对邀约、课表记录的跨创建人编辑范围。"""

from typing import Literal, TypedDict

from app.services.storage import delete_item, load_data, save_item

FILENAME = "position_edit_permissions.json"
EditArea = Literal["visits", "activities"]
EditScope = Literal["own", "all"]


class PositionEditPermissions(TypedDict):
    visits: EditScope
    activities: EditScope


DEFAULT_PERMISSIONS: PositionEditPermissions = {
    "visits": "own",
    "activities": "own",
}
SUPER_ADMIN_PERMISSIONS: PositionEditPermissions = {
    "visits": "all",
    "activities": "all",
}

_permissions: dict[str, PositionEditPermissions] = {}


def _normalize_scope(value: object) -> EditScope:
    return "all" if value == "all" else "own"


def _normalize_permissions(value: object) -> PositionEditPermissions:
    raw = value if isinstance(value, dict) else {}
    return {
        "visits": _normalize_scope(raw.get("visits")),
        "activities": _normalize_scope(raw.get("activities")),
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
        return dict(SUPER_ADMIN_PERMISSIONS)
    return dict(_permissions.get(position, DEFAULT_PERMISSIONS))


def get_all() -> dict[str, PositionEditPermissions]:
    return {
        position: dict(scopes)
        for position, scopes in _permissions.items()
    }


def set_permissions(position: str, permissions: object) -> PositionEditPermissions:
    normalized = (
        dict(SUPER_ADMIN_PERMISSIONS)
        if position == "超级管理员"
        else _normalize_permissions(permissions)
    )
    _permissions[position] = normalized
    save_item(FILENAME, position, normalized)
    return dict(normalized)


def has_all_edit(position: str, area: EditArea) -> bool:
    return get_permissions(position)[area] == "all"


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
