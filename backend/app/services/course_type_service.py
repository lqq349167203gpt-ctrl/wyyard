from typing import List
from app.services.storage import load_data, save_data, save_item
from app.services.course_service import list_courses

FILENAME = "course_types.json"
_types: List[str] = []


def _load():
    global _types
    data = load_data(FILENAME)
    raw = data.get("types", [])
    _types = raw.get("types", raw) if isinstance(raw, dict) else raw
    # 合并课程数据中已有的类型（向后兼容）
    existing = {c.type for c in list_courses() if c.type}
    for t in existing:
        if t not in _types:
            _types.append(t)


def _save(item_id: str = ""):
    if item_id:
        save_item(FILENAME, "types", {"types": _types})
    else:
        save_data(FILENAME, {"types": _types})


_load()


def list_course_types() -> List[str]:
    return list(_types)


def create_course_type(name: str) -> str:
    if name not in _types:
        _types.append(name)
        _save(name)
    return name


def delete_course_type(name: str) -> bool:
    if name in _types:
        _types.remove(name)
        _save(name)
        return True
    return False
