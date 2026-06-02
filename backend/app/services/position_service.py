import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict
from pydantic import BaseModel
from app.services.storage import load_data, save_data, save_item

FILENAME = "positions.json"


class PositionBase(BaseModel):
    name: str
    description: str = ""
    icon: str = "Users"


class PositionCreate(PositionBase):
    pass


class Position(PositionBase):
    id: str
    created_at: datetime
    is_system: bool = False
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


_positions: Dict[str, Position] = {}


def _load():
    global _positions
    data = load_data(FILENAME)
    _positions = {k: Position(**v) for k, v in data.items()}


def _save(item_id: str = ""):
    if item_id:
        item = _positions.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        save_data(FILENAME, {k: v.model_dump(mode="json") for k, v in _positions.items()})


_load()


def list_positions() -> List[Position]:
    return sorted([v for v in _positions.values() if not v.is_deleted], key=lambda x: x.created_at)


def get_position(position_id: str) -> Optional[Position]:
    p = _positions.get(position_id)
    if p and not p.is_deleted:
        return p
    return None


def create_position(data: PositionCreate) -> Position:
    now = datetime.now(timezone.utc)
    position = Position(id=str(uuid.uuid4())[:8], created_at=now, **data.model_dump())
    _positions[position.id] = position
    _save(position.id)
    return position


def update_position(position_id: str, data: dict) -> Optional[Position]:
    position = _positions.get(position_id)
    if not position:
        return None
    if position.is_system:
        return position
    for k, v in data.items():
        if hasattr(position, k):
            setattr(position, k, v)
    _save(position_id)
    return position


def delete_position(position_id: str) -> bool:
    position = _positions.get(position_id)
    if not position:
        return False
    if position.is_system:
        return False
    position.is_deleted = True
    position.deleted_at = datetime.now(timezone.utc)
    _save(position_id)
    return True
