from datetime import datetime

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class ActivityFollowupCreate(StrictBaseModel):
    activity_type: str = Field(min_length=1, max_length=20)
    session_id: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=1000)


class ActivityFollowup(SafeBaseModel):
    id: str
    customer_id: str
    activity_key: str
    activity_type: str
    session_id: str
    activity_name: str
    activity_category: str
    activity_date: str
    start_time: str = ""
    end_time: str = ""
    teacher: str = ""
    customer_role: str = ""
    content: str
    created_at: datetime
    updated_at: datetime
