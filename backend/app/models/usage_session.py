from datetime import datetime

from pydantic import Field

from app.models.base import SafeBaseModel


class UsageInterval(SafeBaseModel):
    start_at: datetime
    end_at: datetime
    page_path: str = ""
    page_name: str = ""


class UsageSession(SafeBaseModel):
    id: str
    account_id: str
    username: str = ""
    owner: str = ""
    role: str = ""
    source: str = "pc"
    ip: str = ""
    device_info: str = ""
    started_at: datetime
    last_heartbeat_at: datetime
    ended_at: datetime | None = None
    current_page_path: str = ""
    intervals: list[UsageInterval] = Field(default_factory=list)
