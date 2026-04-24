from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from app.config.settings import settings


class ChatState(TypedDict):
    messages: Annotated[list, add_messages]
    system_prompt: str
    model: str


def chat_node(state: ChatState) -> ChatState:
    model_name = state.get("model", settings.anthropic_model)
    llm = ChatAnthropic(
        model=model_name,
        api_key=settings.anthropic_api_key,
        temperature=0.7,
        max_tokens=4096,
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
