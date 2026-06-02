from typing import Dict, List
from app.services.storage import load_data, save_data, save_item

FILENAME = "position_permissions.json"
_permissions: Dict[str, List[str]] = {}


def _load():
    global _permissions
    _permissions = load_data(FILENAME) or {}


def _save(item_id: str = ""):
    if item_id:
        item = _permissions.get(item_id)
        if item:
            save_item(FILENAME, item_id, item)
    else:
        save_data(FILENAME, _permissions)


_load()


def get_permissions(position: str) -> List[str]:
    return _permissions.get(position, [])


def set_permissions(position: str, pages: List[str]):
    _permissions[position] = pages
    _save(position)


def get_all() -> Dict[str, List[str]]:
    return _permissions
