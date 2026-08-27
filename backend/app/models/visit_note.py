from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel

VisitNoteCategory = Literal["customer_info", "follow_up"]


class VisitNoteCreate(StrictBaseModel):
    visit_id: str
    category: VisitNoteCategory
    content: str = Field(min_length=1, max_length=5000)


class VisitNoteUpdate(StrictBaseModel):
    content: str = Field(min_length=1, max_length=5000)


class VisitNote(SafeBaseModel):
    id: str
    visit_id: str
    category: VisitNoteCategory
    content: str
    created_by_id: str = ""
    created_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None
