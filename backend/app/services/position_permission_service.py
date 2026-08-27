from typing import Dict, List

from app.services.storage import load_data, save_data, save_item

FILENAME = "position_permissions.json"
_permissions: Dict[str, List[str]] = {}
REMOVED_PAGE_KEYS = {"business-reminders", "commission-records", "reminders", "staff-benefits"}


def _active_pages(pages: List[str]) -> List[str]:
    return [page for page in pages if page not in REMOVED_PAGE_KEYS]


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
    return _active_pages(_permissions.get(position, []))


def set_permissions(position: str, pages: List[str]):
    _permissions[position] = _active_pages(pages)
    _save(position)


def get_all() -> Dict[str, List[str]]:
    return {position: _active_pages(pages) for position, pages in _permissions.items()}


def rename_position_in_permissions(old_name: str, new_name: str):
    """角色改名时，迁移 page permissions 的 key"""
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
