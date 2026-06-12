from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ChatRecordBase(BaseModel):
    user_id: str
    user_name: str = ""
    user_role: str = ""
    role: str  # "user" or "assistant"
    content: str
    session_id: str = ""


class ChatRecordCreate(ChatRecordBase):
    pass


class ChatRecord(ChatRecordBase):
    id: str
    created_at: datetime
