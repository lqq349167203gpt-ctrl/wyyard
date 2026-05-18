from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PositionBase(BaseModel):
    name: str
    description: str = ""
    icon: str = "Users"


class PositionCreate(PositionBase):
    pass


class Position(PositionBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
