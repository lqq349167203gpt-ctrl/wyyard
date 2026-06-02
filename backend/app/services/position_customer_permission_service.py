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
        _permissions[section] = load_data(filename) or {}


def _save(section: str, item_id: str = ""):
    if item_id:
        item = _permissions[section].get(item_id)
        if item:
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
