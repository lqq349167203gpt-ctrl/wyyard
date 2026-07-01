from app.models.base import SafeBaseModel, StrictBaseModel
from datetime import datetime
from typing import List, Optional


class RoomBase(SafeBaseModel):
    name: str


class Room(RoomBase):
    id: str
    space_id: str
    is_deleted: bool = False


class SpaceBase(SafeBaseModel):
    name: str
    sort_order: int = 0


class SpaceCreate(SpaceBase):
    pass


class Space(SpaceBase):
    id: str
    rooms: List[Room] = []
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class RoomCreate(StrictBaseModel):
    name: str
