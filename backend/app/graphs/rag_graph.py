from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config.settings import settings
from app.services.knowledge import search


class RAGState(TypedDict):
    messages: Annotated[list, add_messages]
    system_prompt: str
    model: str
    context: str


def retrieve_node(state: RAGState) -> RAGState:
    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, "content") else str(last_message)
    results = search(query, top_k=3)
    context = "\n\n".join([f"[来源: {r['metadata'].get('filename', '未知')}]\n{r['content']}" for r in results])
    return {"context": context}


def generate_node(state: RAGState) -> RAGState:
    llm = ChatOpenAI(
        model=state.get("model", settings.llm_model),
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        max_tokens=4096,
    )

    system_content = state.get("system_prompt", "你是一个知识库助手。")
    if state.get("context"):
        system_content += f"\n\n以下是检索到的相关内容，请基于这些内容回答：\n\n{state['context']}"

    messages = [SystemMessage(content=system_content)]
    for msg in state["messages"]:
        if hasattr(msg, "content"):
            messages.append(msg)

    response = llm.invoke(messages)
    return {"messages": [response]}


def build_rag_graph() -> StateGraph:
    graph = StateGraph(RAGState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)
    return graph.compile()
