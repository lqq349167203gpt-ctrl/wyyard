from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from langchain_core.messages import AIMessage, HumanMessage

from app.models.agent import AgentCreate, AgentUpdate, AgentChatRequest, AgentMessage
from app.services import agent_service
from app.agents.registry import get_or_create_graph

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
async def list_agents():
    return agent_service.list_agents()


@router.post("")
async def create_agent(data: AgentCreate):
    return agent_service.create_agent(data)


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    agent = agent_service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return agent


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
async def chat_with_agent(agent_id: str, data: AgentChatRequest):
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
