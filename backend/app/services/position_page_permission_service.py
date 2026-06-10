from typing import Dict, List
from app.services.storage import load_data, save_data, save_item

FILENAME = "position_page_permissions.json"

_permissions: Dict[str, Dict[str, List[str]]] = {}


def _load():
    global _permissions
    _permissions = load_data(FILENAME) or {}


def _save(page: str, position: str):
    item = _permissions.get(page, {}).get(position)
    if item is not None:
        save_item(FILENAME + ":" + page, position, item)


_load()


def get_page_permissions(page: str, position: str) -> List[str]:
    return _permissions.get(page, {}).get(position, [])


def set_page_permissions(page: str, position: str, member_types: List[str]):
    if page not in _permissions:
        _permissions[page] = {}
    _permissions[page][position] = member_types
    _save(page, position)


def get_all_page(page: str) -> Dict[str, List[str]]:
    return _permissions.get(page, {})


def get_all() -> Dict[str, Dict[str, List[str]]]:
    return _permissions
