from app.graphs.chat_graph import build_chat_graph


_agent_graphs: dict[str, object] = {}


def get_or_create_graph(agent_id: str) -> object:
    if agent_id not in _agent_graphs:
        _agent_graphs[agent_id] = build_chat_graph()
    return _agent_graphs[agent_id]


def remove_graph(agent_id: str) -> None:
    _agent_graphs.pop(agent_id, None)
