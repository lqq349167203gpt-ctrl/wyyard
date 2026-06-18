from typing import List, Optional
from app.services.storage import load_data, save_data, save_item
from app.services.course_service import list_courses

FILENAME = "course_types.json"
_types: List[dict] = []  # [{"name": "...", "organization_id": "..."}, ...]


def _load():
    global _types
    data = load_data(FILENAME)
    raw = data.get("types", [])
    if isinstance(raw, dict):
        raw = raw.get("types", raw)
    # 兼容旧格式（字符串列表）→ 转为对象列表
    if isinstance(raw, list) and raw and isinstance(raw[0], str):
        _types = [{"name": t, "organization_id": ""} for t in raw]
    elif isinstance(raw, list):
        _types = raw
    else:
        _types = []
    # 合并课程数据中已有的类型（向后兼容）
    existing = {c.type for c in list_courses() if c.type}
    existing_names = {t["name"] for t in _types}
    for t in existing:
        if t not in existing_names:
            _types.append({"name": t, "organization_id": ""})


def _save(item_id: str = ""):
    if item_id:
        save_item(FILENAME, "types", {"types": _types})
    else:
        save_data(FILENAME, {"types": _types})


_load()


def list_course_types() -> List[dict]:
    return list(_types)


def list_course_type_names() -> List[str]:
    return [t["name"] for t in _types]


def create_course_type(name: str, organization_id: str = "") -> dict:
    existing_names = {t["name"] for t in _types}
    if name not in existing_names:
        item = {"name": name, "organization_id": organization_id}
        _types.append(item)
        _save(name)
        return item
    return {"name": name, "organization_id": organization_id}


def rename_course_type(old_name: str, new_name: str) -> bool:
    names = [t["name"] for t in _types]
    if old_name not in names:
        return False
    if new_name in names and new_name != old_name:
        raise ValueError("类型名称已存在")
    idx = names.index(old_name)
    _types[idx]["name"] = new_name
    _save(old_name)
    # 同步更新课程数据中的类型字段
    from app.services.course_service import rename_course_type as sync_courses
    from app.services.internal_course_session_service import rename_course_type as sync_sessions
    from app.services.internal_course_service import rename_course_type as sync_internal
    sync_courses(old_name, new_name)
    sync_sessions(old_name, new_name)
    sync_internal(old_name, new_name)
    return True


def update_course_type(name: str, organization_id: Optional[str] = None) -> bool:
    names = [t["name"] for t in _types]
    if name not in names:
        return False
    idx = names.index(name)
    if organization_id is not None:
        _types[idx]["organization_id"] = organization_id
    _save(name)
    return True


def delete_course_type(name: str) -> bool:
    names = [t["name"] for t in _types]
    if name in names:
        idx = names.index(name)
        _types.pop(idx)
        _save(name)
        return True
    return False


def reorder_course_types(ordered_names: List[str]) -> List[dict]:
    """按给定顺序重排活动类型"""
    global _types
    name_map = {t["name"]: t for t in _types}
    ordered = [name_map[n] for n in ordered_names if n in name_map]
    remaining = [t for t in _types if t["name"] not in set(ordered_names)]
    _types = ordered + remaining
    _save()
    return _types
