from pydantic import BaseModel
from enum import Enum
from datetime import datetime


class AgentStatus(str, Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class AgentBase(BaseModel):
    name: str
    description: str = ""
    model: str = "claude-sonnet-4-6"
    system_prompt: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    model: str | None = None
    system_prompt: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    status: AgentStatus | None = None


class Agent(AgentBase):
    id: str
    status: AgentStatus = AgentStatus.STOPPED
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class AgentMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime


class AgentChatRequest(BaseModel):
    message: str
    history: list[AgentMessage] = []
