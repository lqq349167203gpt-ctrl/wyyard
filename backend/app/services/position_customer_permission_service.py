from typing import Dict, List
from app.services.storage import load_data, save_data, save_item

# 三个独立模块
FILENAMES = {
    "customers": "position_customer_permissions.json",
    "class_records": "position_customer_permissions_class_records.json",
    "payment": "position_customer_permissions_payment.json",
}

_permissions: Dict[str, Dict[str, List[str]]] = {"customers": {}, "class_records": {}, "payment": {}}


def _load():
    global _permissions
    for section, filename in FILENAMES.items():
        raw = load_data(filename) or {}
        # 优先按 per-position 格式解读（key=position, value=list），
        # 过滤掉遗留聚合行（key==section, value=dict）
        has_per_position = any(isinstance(v, list) for v in raw.values())
        if has_per_position:
            _permissions[section] = {k: v for k, v in raw.items() if isinstance(v, list)}
        elif section in raw and isinstance(raw[section], dict):
            # 旧聚合格式：{section: {position: list}}
            _permissions[section] = raw[section]
        else:
            _permissions[section] = raw


def _save(section: str, item_id: str = ""):
    if item_id:
        item = _permissions[section].get(item_id)
        if item is not None:
            save_item(FILENAMES[section], item_id, item)
    else:
        save_data(FILENAMES[section], _permissions[section])


_load()


def get_customer_permissions(section: str, position: str) -> List[str]:
    return _permissions.get(section, {}).get(position, [])


def set_customer_permissions(section: str, position: str, member_types: List[str]):
    _permissions[section][position] = member_types
    _save(section, position)


def get_all(section: str) -> Dict[str, List[str]]:
    return _permissions.get(section, {})


def rename_identity_in_permissions(old_name: str, new_name: str):
    """身份改名时，同步更新所有权限配置中的引用"""
    for section in _permissions:
        changed = False
        for position, types in _permissions[section].items():
            if old_name in types:
                types[types.index(old_name)] = new_name
                changed = True
        if changed:
            _save(section)


def remove_identity_from_permissions(identity_name: str):
    """身份删除时，从所有权限配置中移除"""
    for section in _permissions:
        changed = False
        for position, types in list(_permissions[section].items()):
            if identity_name in types:
                types.remove(identity_name)
                changed = True
        if changed:
            _save(section)


def rename_position_in_permissions(old_name: str, new_name: str):
    """角色改名时，迁移 customer permissions 各 section 的 key"""
    for section in _permissions:
        if old_name in _permissions[section]:
            _permissions[section][new_name] = _permissions[section].pop(old_name)
            _save(section)
