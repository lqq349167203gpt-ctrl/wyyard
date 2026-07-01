from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage

from app.config.settings import settings


class ChatState(TypedDict):
    messages: Annotated[list, add_messages]
    system_prompt: str
    model: str
    api_key: str
    base_url: str
    temperature: float
    max_tokens: int


def chat_node(state: ChatState) -> ChatState:
    llm = ChatOpenAI(
        model=state.get("model") or settings.llm_model,
        api_key=state.get("api_key") or settings.llm_api_key,
        base_url=state.get("base_url") or settings.llm_base_url,
        temperature=state.get("temperature") if state.get("temperature") is not None else 0.7,
        max_tokens=state.get("max_tokens") or 4096,
    )

    messages = []
    if state.get("system_prompt"):
        messages.append(SystemMessage(content=state["system_prompt"]))
    messages.extend(state["messages"])

    response = llm.invoke(messages)
    return {"messages": [response]}


def build_chat_graph() -> StateGraph:
    graph = StateGraph(ChatState)
    graph.add_node("chat", chat_node)
    graph.add_edge(START, "chat")
    graph.add_edge("chat", END)
    return graph.compile()
