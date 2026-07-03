from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.models.chat_log import ChatLog, ChatLogCreate
from app.services.storage import load_data, save_data, save_item

FILENAME = "chat_logs.json"
_logs: dict[str, ChatLog] = {}


def _load():
    global _logs
    raw = load_data(FILENAME)
    _logs = {k: ChatLog(**v) for k, v in raw.items()}


def _save():
    save_data(FILENAME, {k: v.model_dump() for k, v in _logs.items()})


def create_log(data: ChatLogCreate) -> ChatLog:
    log = ChatLog(
        id=uuid.uuid4().hex[:12],
        created_at=datetime.now(timezone.utc).isoformat(),
        **data.model_dump(),
    )
    _logs[log.id] = log
    save_item(FILENAME, log.id, log.model_dump())
    return log


def list_logs(
    operator: Optional[str] = None,
    mode: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    keyword: Optional[str] = None,
) -> List[ChatLog]:
    results = list(_logs.values())
    if operator:
        results = [l for l in results if l.operator == operator]
    if mode:
        results = [l for l in results if l.mode == mode]
    if date_from:
        results = [l for l in results if l.created_at >= date_from]
    if date_to:
        results = [l for l in results if l.created_at <= date_to]
    if keyword:
        kw = keyword.lower()
        results = [l for l in results if kw in l.user_message.lower() or kw in l.ai_reply.lower()]
    results.sort(key=lambda x: x.created_at, reverse=True)
    return results


def get_log(log_id: str) -> Optional[ChatLog]:
    return _logs.get(log_id)


_load()
