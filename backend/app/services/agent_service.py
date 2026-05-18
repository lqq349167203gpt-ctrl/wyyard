import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from app.models.agent import Agent, AgentCreate, AgentUpdate, AgentStatus
from app.services.storage import load_data, save_data

FILENAME = "agents.json"
_agents: Dict[str, Agent] = {}


def _load():
    global _agents
    data = load_data(FILENAME)
    _agents = {k: Agent(**v) for k, v in data.items()}


def _save():
    data = {k: v.model_dump(mode="json") for k, v in _agents.items()}
    save_data(FILENAME, data)


_load()


def list_agents() -> List[Agent]:
    return [v for v in _agents.values() if not v.is_deleted]


def get_agent(agent_id: str) -> Optional[Agent]:
    agent = _agents.get(agent_id)
    if agent and agent.is_deleted:
        return None
    return agent


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
    _save()
    return agent


def update_agent(agent_id: str, data: AgentUpdate) -> Optional[Agent]:
    agent = _agents.get(agent_id)
    if not agent:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(agent, key, value)
    agent.updated_at = datetime.now(timezone.utc)
    _save()
    return agent


def delete_agent(agent_id: str) -> bool:
    agent = _agents.get(agent_id)
    if not agent:
        return False
    agent.is_deleted = True
    agent.deleted_at = datetime.now(timezone.utc)
    _save()
    return True
