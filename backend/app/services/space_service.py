import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.space import Space, SpaceCreate, Room, RoomCreate
from app.services.storage import load_data, save_data, save_item

FILENAME = "spaces.json"

SESSION_FILES = [
    "class_records.json",
    "emotional_release_sessions.json",
    "oh_card_reading_sessions.json",
    "energy_knot_sessions.json",
    "group_case_sessions.json",
    "internal_course_sessions.json",
]
_spaces: Dict[str, Space] = {}


def _load():
    global _spaces
    data = load_data(FILENAME)
    _spaces = {}
    for k, v in data.items():
        rooms = [Room(**r) for r in v.get("rooms", [])]
        _spaces[k] = Space(rooms=rooms, **{key: val for key, val in v.items() if key != "rooms"})


def _save(item_id: str = ""):
    if item_id:
        item = _spaces.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {}
        for k, v in _spaces.items():
            space_data = v.model_dump(mode="json")
            data[k] = space_data
        save_data(FILENAME, data)


_load()


def list_spaces() -> List[Space]:
    result = []
    for v in _spaces.values():
        if not v.is_deleted:
            filtered = v.model_copy()
            filtered.rooms = [r for r in v.rooms if not r.is_deleted]
            result.append(filtered)
    return result


def get_all_rooms() -> List[Room]:
    """返回所有房间（含已删除），用于 room_name 回填"""
    rooms = []
    for sp in _spaces.values():
        rooms.extend(sp.rooms)
    return rooms


def get_all_spaces() -> List[Space]:
    """返回所有空间（含已删除），用于 space_name 回填"""
    return list(_spaces.values())


def get_space(space_id: str) -> Optional[Space]:
    space = _spaces.get(space_id)
    if space and space.is_deleted:
        return None
    return space


def create_space(data: SpaceCreate) -> Space:
    existing = [s for s in _spaces.values() if not s.is_deleted and s.name == data.name]
    if existing:
        raise ValueError("当前名称已存在")
    now = datetime.now(timezone.utc)
    space = Space(
        id=str(uuid.uuid4())[:8],
        rooms=[],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _spaces[space.id] = space
    _save(space.id)
    return space


def update_space(space_id: str, data: dict) -> Optional[Space]:
    space = _spaces.get(space_id)
    if not space:
        return None
    if "name" in data and data["name"] != space.name:
        existing = [s for s in _spaces.values() if not s.is_deleted and s.id != space_id and s.name == data["name"]]
        if existing:
            raise ValueError("当前名称已存在")
    for key, value in data.items():
        if key != "rooms" and hasattr(space, key):
            setattr(space, key, value)
    space.updated_at = datetime.now(timezone.utc)
    _spaces[space_id] = space
    _save(space_id)
    return space


def delete_space(space_id: str) -> bool:
    space = _spaces.get(space_id)
    if not space:
        return False
    active_rooms = [r for r in space.rooms if not r.is_deleted]
    if active_rooms:
        raise ValueError(f"该空间存在 {len(active_rooms)} 个房间，无法删除")
    space.is_deleted = True
    space.deleted_at = datetime.now(timezone.utc)
    _save(space_id)
    return True


def add_room(space_id: str, data: RoomCreate) -> Optional[Room]:
    space = _spaces.get(space_id)
    if not space:
        return None
    for s in _spaces.values():
        if not s.is_deleted:
            for r in s.rooms:
                if not r.is_deleted and r.name == data.name:
                    raise ValueError("当前名称已存在")
    room = Room(
        id=str(uuid.uuid4())[:8],
        space_id=space_id,
        name=data.name,
    )
    space.rooms.append(room)
    space.updated_at = datetime.now(timezone.utc)
    _save(space_id)
    return room


def is_room_referenced(room_id: str) -> bool:
    for filename in SESSION_FILES:
        data = load_data(filename)
        for item in data.values():
            if isinstance(item, dict) and item.get("room_id") == room_id:
                return True
    return False


def update_room(space_id: str, room_id: str, data: dict) -> Optional[Room]:
    space = _spaces.get(space_id)
    if not space:
        return None
    room = next((r for r in space.rooms if r.id == room_id and not r.is_deleted), None)
    if not room:
        return None
    if "name" in data and data["name"] != room.name:
        for s in _spaces.values():
            if not s.is_deleted:
                for r in s.rooms:
                    if not r.is_deleted and r.id != room_id and r.name == data["name"]:
                        raise ValueError("当前名称已存在")
        room.name = data["name"]
    space.updated_at = datetime.now(timezone.utc)
    _save(space_id)
    return room


def delete_room(space_id: str, room_id: str, force: bool = False) -> dict:
    space = _spaces.get(space_id)
    if not space:
        return {"success": False, "error": "空间不存在"}
    room = next((r for r in space.rooms if r.id == room_id), None)
    if not room:
        return {"success": False, "error": "房间不存在"}
    if room.is_deleted:
        return {"success": False, "error": "房间已被删除"}
    if is_room_referenced(room_id):
        if not force:
            return {"success": False, "referenced": True, "error": "当前房间已被使用，请输入房间名称"}
        room.is_deleted = True
        space.updated_at = datetime.now(timezone.utc)
        _save(space_id)
        return {"success": True, "soft_deleted": True}
    space.rooms = [r for r in space.rooms if r.id != room_id]
    space.updated_at = datetime.now(timezone.utc)
    _save(space_id)
    return {"success": True, "soft_deleted": False}
