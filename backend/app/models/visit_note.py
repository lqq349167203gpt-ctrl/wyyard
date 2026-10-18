from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.models.base import SafeBaseModel, StrictBaseModel

VisitNoteCategory = Literal["visit_need", "customer_info", "follow_up", "customer_feedback"]


class FollowUpPlanFields(SafeBaseModel):
    next_follow_up_person_id: str = ""
    next_follow_up_person: str = ""
    next_follow_up_date: str = ""

    @field_validator("next_follow_up_date")
    @classmethod
    def validate_follow_up_date(cls, value):
        try:
            if value and date.fromisoformat(value).isoformat() != value:
                raise ValueError
        except ValueError:
            raise ValueError("跟进时间无效，请选择正确的年月日")
        return value


class VisitNoteCreate(FollowUpPlanFields, StrictBaseModel):
    need_tag_ids: list[str] = Field(default_factory=list, max_length=100)
    visit_id: str
    category: VisitNoteCategory
    content: str = Field(default="", max_length=5000)
    feedback_person_id: str = ""
    feedback_person: str = ""


class VisitNoteUpdate(StrictBaseModel):
    need_tag_ids: list[str] | None = Field(default=None, max_length=100)
    content: str = Field(default="", max_length=5000)
    feedback_person_id: str | None = None
    feedback_person: str | None = None
    next_follow_up_person_id: str | None = None
    next_follow_up_person: str | None = None
    next_follow_up_date: str | None = None

    @field_validator("next_follow_up_date")
    @classmethod
    def validate_follow_up_date(cls, value):
        return FollowUpPlanFields.validate_follow_up_date(value) if value is not None else None


class VisitNote(FollowUpPlanFields):
    need_tags: list[dict] = Field(default_factory=list, max_length=100)
    id: str
    visit_id: str
    category: VisitNoteCategory
    content: str
    created_by_id: str = ""
    created_by: str = ""
    feedback_person_id: str = ""
    feedback_person: str = ""
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None
