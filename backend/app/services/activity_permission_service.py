from typing import Dict

from app.services.storage import load_data, save_data, save_item

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


def _save(member_type: str = ""):
    if member_type:
        item = _permissions.get(member_type)
        if item:
            save_item(FILENAME, member_type, item)
    else:
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


def remove_identity(identity_name: str):
    """身份删除时，从活动权限配置中移除"""
    if identity_name in _permissions:
        del _permissions[identity_name]
        _save()


def rename_identity(old_name: str, new_name: str):
    """身份改名时，同步更新活动权限配置"""
    if old_name in _permissions:
        _permissions[new_name] = _permissions.pop(old_name)
        _save(new_name)
        # 清除旧 key 的持久化数据
        from app.services.storage import load_data
        data = load_data(FILENAME) or {}
        if old_name in data:
            del data[old_name]
            from app.services.storage import save_data as sd
            sd(FILENAME, data)
