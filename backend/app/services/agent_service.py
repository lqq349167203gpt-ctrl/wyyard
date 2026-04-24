import uuid
from datetime import datetime, timezone

from app.models.agent import Agent, AgentCreate, AgentUpdate, AgentStatus

# 内存存储，后续替换为数据库
_agents: dict[str, Agent] = {}


def list_agents() -> list[Agent]:
    return list(_agents.values())


def get_agent(agent_id: str) -> Agent | None:
    return _agents.get(agent_id)


def create_agent(data: AgentCreate) -> Agent:
    now = datetime.now(timezone.utc)
    agent = Agent(
        id=str(uuid.uuid4())[:8],
        status=AgentStatus.STOPPED,
        created_at=now,
        updated_at=now,
        message_count=0,
        **data.model_dump(),
    )
    _agents[agent.id] = agent
    return agent


def update_agent(agent_id: str, data: AgentUpdate) -> Agent | None:
    agent = _agents.get(agent_id)
    if not agent:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(agent, key, value)
    agent.updated_at = datetime.now(timezone.utc)
    return agent


def delete_agent(agent_id: str) -> bool:
    return _agents.pop(agent_id, None) is not None
