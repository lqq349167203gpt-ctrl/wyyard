from datetime import datetime
from typing import Optional

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class FollowUpStatusCreate(StrictBaseModel):
    name: str = Field(min_length=1, max_length=30)
    description: str = Field(min_length=1, max_length=200)


class FollowUpStatusUpdate(StrictBaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=30)
    description: Optional[str] = Field(default=None, min_length=1, max_length=200)
    enabled: Optional[bool] = None


class FollowUpStatusConfig(SafeBaseModel):
    id: str
    name: str
    description: str
    sort_order: int = 0
    enabled: bool = True
    created_at: datetime
    updated_at: datetime

