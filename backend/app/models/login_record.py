from datetime import datetime
from typing import Literal

from app.models.base import SafeBaseModel


class LoginRecord(SafeBaseModel):
    id: str
    event_type: Literal["login", "page_view"]
    account_id: str
    username: str = ""
    owner: str = ""
    role: str = ""
    source: str = "pc"
    ip: str = ""
    device_info: str = ""
    page_path: str = ""
    page_name: str = ""
    created_at: datetime
