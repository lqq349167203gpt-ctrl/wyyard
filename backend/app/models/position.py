from app.models.base import SafeBaseModel, StrictBaseModel
from datetime import datetime
from typing import Optional


class PositionBase(SafeBaseModel):
    name: str
    description: str = ""
    icon: str = "Users"


class PositionCreate(PositionBase):
    pass


class PositionUpdate(StrictBaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None


class Position(PositionBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
