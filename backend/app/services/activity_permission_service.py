from typing import Dict, List

from app.services.storage import load_data, save_data

FILENAME = "activity_permissions.json"
ACTIVITY_TYPES = ["沙龙活动", "觉醒游戏", "情绪释放", "能量结", "内部课程"]

_permissions: Dict[str, Dict[str, Dict[str, bool]]] = {}


def _migrate(data: dict) -> dict:
    """迁移旧格式 List[str] → 新格式 Dict[str, Dict[str, bool]]"""
    result = {}
    for member_type, value in data.items():
        if isinstance(value, list):
            result[member_type] = {}
            for at in ACTIVITY_TYPES:
                allowed = at in value
                result[member_type][at] = {"view": allowed, "participate": allowed}
        elif isinstance(value, dict):
            result[member_type] = value
    return result


def _load():
    global _permissions
    data = load_data(FILENAME)
    if data:
        _permissions = _migrate(data)
    else:
        _permissions = {}


def _save():
    save_data(FILENAME, _permissions)


_load()


def get_all() -> Dict[str, Dict[str, Dict[str, bool]]]:
    return {k: dict(v) for k, v in _permissions.items()}


def set_all(permissions: Dict[str, Dict[str, Dict[str, bool]]]):
    global _permissions
    # 合并而非替换：保留未在本次请求中的身份
    for member_type, activities in permissions.items():
        # 检查是否全部为默认值（无实际限制），是则删除该身份
        all_default = all(
            a.get("view", True) and a.get("participate", True)
            for a in activities.values()
        )
        if all_default:
            _permissions.pop(member_type, None)
        else:
            _permissions[member_type] = activities
    _save()
