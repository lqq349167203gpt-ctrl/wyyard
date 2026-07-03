from typing import Optional, List
from pydantic import BaseModel
from app.models.base import SafeBaseModel


class ToolCall(BaseModel):
    name: str
    args: dict
    result: str


class ChatLogBase(SafeBaseModel):
    user_message: str
    tool_calls: List[ToolCall] = []
    ai_reply: str = ""
    operator: str = ""
    mode: str = ""       # "visit" | "customer"
    space_id: str = ""
    date: str = ""


class ChatLogCreate(ChatLogBase):
    pass


class ChatLog(ChatLogBase):
    id: str
    created_at: str
