from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel

ActivityParticipantNoteSource = Literal[
    "class_record",
    "group_case",
    "emotional_release",
    "energy_knot",
    "internal_course",
]
ActivityParticipantNoteCategory = Literal["customer_info", "follow_up"]


class ActivityParticipantNoteUpsert(StrictBaseModel):
    activity_source: ActivityParticipantNoteSource
    session_id: str = Field(min_length=1, max_length=100)
    customer_id: str = Field(min_length=1, max_length=100)
    category: ActivityParticipantNoteCategory
    content: str = Field(min_length=1, max_length=5000)


class ActivityParticipantNote(SafeBaseModel):
    id: str
    activity_source: ActivityParticipantNoteSource
    session_id: str
    customer_id: str
    category: ActivityParticipantNoteCategory
    content: str
    activity_name: str = ""
    activity_date: str = ""
    start_time: str = ""
    end_time: str = ""
    created_by_id: str = ""
    created_by: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None
