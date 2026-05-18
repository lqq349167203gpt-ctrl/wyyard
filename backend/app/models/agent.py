from pydantic import BaseModel
from enum import Enum
from datetime import datetime
from typing import Optional


class AgentStatus(str, Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class AgentBase(BaseModel):
    name: str
    description: str = ""
    model: str = "glm-5"
    system_prompt: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096
    ai_config_id: Optional[str] = None


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    ai_config_id: Optional[str] = None
    status: Optional[AgentStatus] = None


class Agent(AgentBase):
    id: str
    status: AgentStatus = AgentStatus.STOPPED
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class AgentMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime


class AgentChatRequest(BaseModel):
    message: str
    history: list[AgentMessage] = []
