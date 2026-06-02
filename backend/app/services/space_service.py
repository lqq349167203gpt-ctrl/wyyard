import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.space import Space, SpaceCreate, Room, RoomCreate
from app.services.storage import load_data, save_data, save_item

FILENAME = "spaces.json"
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
    return [v for v in _spaces.values() if not v.is_deleted]


def get_space(space_id: str) -> Optional[Space]:
    space = _spaces.get(space_id)
    if space and space.is_deleted:
        return None
    return space


def create_space(data: SpaceCreate) -> Space:
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
    space.is_deleted = True
    space.deleted_at = datetime.now(timezone.utc)
    _save(space_id)
    return True


def add_room(space_id: str, data: RoomCreate) -> Optional[Room]:
    space = _spaces.get(space_id)
    if not space:
        return None
    room = Room(
        id=str(uuid.uuid4())[:8],
        space_id=space_id,
        name=data.name,
    )
    space.rooms.append(room)
    space.updated_at = datetime.now(timezone.utc)
    _save(space_id)
    return room


def delete_room(space_id: str, room_id: str) -> bool:
    space = _spaces.get(space_id)
    if not space:
        return False
    original_count = len(space.rooms)
    space.rooms = [r for r in space.rooms if r.id != room_id]
    if len(space.rooms) < original_count:
        space.updated_at = datetime.now(timezone.utc)
        _save(space_id)
        return True
    return False
