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


def create_course_type(name: str, organization_id: str = "", show_in_client: bool = False,
                       list_image: str = "", detail_images: list[str] | None = None,
                       category: str = "salon") -> dict:
    existing_names = {t["name"] for t in _types}
    if name in existing_names:
        raise ValueError("类型名称已存在")
    item = {
        "name": name,
        "organization_id": organization_id,
        "show_in_client": show_in_client,
        "list_image": list_image,
        "detail_images": detail_images or [],
        "category": category,
    }
    _types.append(item)
    _save(name)
    return item


def rename_course_type(old_name: str, new_name: str) -> bool:
    names = [t["name"] for t in _types]
    if old_name not in names:
        return False
    if new_name in names and new_name != old_name:
        raise ValueError("类型名称已存在")
    idx = names.index(old_name)
    _types[idx]["name"] = new_name
    # 先同步所有下游，成功后再持久化
    try:
        from app.services.course_service import rename_course_type as sync_courses
        from app.services.internal_course_session_service import rename_course_type as sync_sessions
        from app.services.internal_course_service import rename_course_type as sync_internal
        from app.services.class_record_service import rename_course_type as sync_class_records
        sync_courses(old_name, new_name)
        sync_sessions(old_name, new_name)
        sync_internal(old_name, new_name)
        sync_class_records(old_name, new_name)
    except Exception:
        _types[idx]["name"] = old_name  # 回滚内存
        raise
    _save()
    return True


def update_course_type(name: str, organization_id: Optional[str] = None, show_in_client: Optional[bool] = None,
                       list_image: Optional[str] = None, detail_images: Optional[list[str]] = None,
                       category: Optional[str] = None) -> bool:
    names = [t["name"] for t in _types]
    if name not in names:
        return False
    idx = names.index(name)
    if organization_id is not None:
        _types[idx]["organization_id"] = organization_id
    if show_in_client is not None:
        _types[idx]["show_in_client"] = show_in_client
    if list_image is not None:
        _types[idx]["list_image"] = list_image
    if detail_images is not None:
        _types[idx]["detail_images"] = detail_images
    if category is not None:
        _types[idx]["category"] = category
    _save(name)
    return True


def delete_course_type(name: str) -> bool:
    # 级联检查：是否有活动记录或内部课程仍引用该类型
    from app.services.class_record_service import list_records
    from app.services.internal_course_session_service import list_sessions as list_ics
    from app.services.internal_course_service import list_courses as list_internal

    refs = []
    for r in list_records():
        if r.course_type == name:
            refs.append(f"活动记录 {r.id}")
            break
    for s in list_ics():
        if s.course_type == name:
            refs.append(f"内部课程活动 {s.id}")
            break
    for c in list_internal():
        if c.course_type == name:
            refs.append(f"内部课程 {c.id}")
            break
    if refs:
        raise ValueError(f"该类型仍被引用，无法删除：{'、'.join(refs)}")

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
