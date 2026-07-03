from app.models.base import SafeBaseModel
from datetime import datetime


class ChatRecordBase(SafeBaseModel):
    user_id: str
    user_name: str = ""
    user_role: str = ""
    role: str  # "user" or "assistant"
    content: str
    session_id: str = ""
    mode: str = ""  # "visit" | "customer" | "system" | ""


class ChatRecordCreate(ChatRecordBase):
    pass


class ChatRecord(ChatRecordBase):
    id: str
    created_at: datetime
