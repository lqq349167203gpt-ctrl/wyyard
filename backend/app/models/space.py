from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class RoomBase(BaseModel):
    name: str


class Room(RoomBase):
    id: str
    space_id: str


class SpaceBase(BaseModel):
    name: str


class SpaceCreate(SpaceBase):
    pass


class Space(SpaceBase):
    id: str
    rooms: List[Room] = []
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class RoomCreate(BaseModel):
    name: str
