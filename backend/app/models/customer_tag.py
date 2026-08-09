from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class CustomerTagCreate(StrictBaseModel):
    name: str = Field(min_length=1, max_length=30)
    scope: Literal["public", "private"] = "private"
    description: str = Field(default="", max_length=200)


class CustomerTagUpdate(StrictBaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=30)
    description: Optional[str] = Field(default=None, max_length=200)
    enabled: Optional[bool] = None


class CustomerTag(SafeBaseModel):
    id: str
    name: str
    scope: Literal["public", "private"]
    description: str = ""
    created_by_id: str
    created_by_name: str
    enabled: bool = True
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class CustomerTagAssignment(SafeBaseModel):
    id: str
    customer_id: str
    tag_id: str
    created_by_id: str
    created_by_name: str
    created_at: datetime


class CustomerTagAssignmentUpdate(StrictBaseModel):
    tag_ids: list[str] = Field(default_factory=list, max_length=100)
