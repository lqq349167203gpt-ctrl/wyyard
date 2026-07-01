import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from langchain_core.messages import AIMessage, HumanMessage

from app.models.agent import AgentCreate, AgentUpdate, AgentChatRequest, AgentMessage
from app.services import agent_service
from app.agents.registry import get_or_create_graph

router = APIRouter(prefix="/api/agents", tags=["agents"])

# 简单内存限流
_agent_chat_rate: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 10
_RATE_WINDOW = 60


@router.get("")
async def list_agents(request: Request):
    agents = agent_service.list_agents()
    result = []
    for a in agents:
        d = a.model_dump(mode="json")
        d["system_prompt"] = ""
        result.append(d)
    return result


@router.post("")
async def create_agent(data: AgentCreate):
    return agent_service.create_agent(data)


@router.get("/{agent_id}")
async def get_agent(agent_id: str, request: Request):
    agent = agent_service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    data = agent.model_dump(mode="json")
    if getattr(request.state, "user_role", "") != "超级管理员":
        data["system_prompt"] = ""
    return data


@router.patch("/{agent_id}")
async def update_agent(agent_id: str, data: AgentUpdate):
    agent = agent_service.update_agent(agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return agent


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    if not agent_service.delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return {"message": "已删除"}


@router.post("/{agent_id}/chat")
async def chat_with_agent(agent_id: str, data: AgentChatRequest, request: Request):
    user_id = getattr(request.state, "user_id", "anon")
    now = time.time()
    _agent_chat_rate[user_id] = [t for t in _agent_chat_rate[user_id] if now - t < _RATE_WINDOW]
    if len(_agent_chat_rate[user_id]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    _agent_chat_rate[user_id].append(now)

    agent = agent_service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    graph = get_or_create_graph(agent_id)

    messages = [HumanMessage(content=data.message)]
    for msg in data.history:
        if msg.role == "user":
            messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            messages.append(AIMessage(content=msg.content))

    result = graph.invoke({
        "messages": messages,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
    })

    ai_message = result["messages"][-1]
    agent.message_count += 1

    return AgentMessage(
        role="assistant",
        content=ai_message.content,
        timestamp=datetime.now(timezone.utc),
    )
