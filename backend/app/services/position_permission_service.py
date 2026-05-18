from typing import Dict, List
from app.services.storage import load_data, save_data

FILENAME = "position_permissions.json"
_permissions: Dict[str, List[str]] = {}


def _load():
    global _permissions
    _permissions = load_data(FILENAME) or {}


def _save():
    save_data(FILENAME, _permissions)


_load()


def get_permissions(position: str) -> List[str]:
    return _permissions.get(position, [])


def set_permissions(position: str, pages: List[str]):
    _permissions[position] = pages
    _save()


def get_all() -> Dict[str, List[str]]:
    return _permissions
