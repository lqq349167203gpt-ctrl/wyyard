import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.operation_log import OperationLog, OperationLogCreate
from app.services.storage import load_data, save_data, save_item

FILENAME = "operation_logs.json"
_logs: Dict[str, OperationLog] = {}


def _load():
    global _logs
    data = load_data(FILENAME)
    _logs = {}
    for k, v in data.items():
        _logs[k] = OperationLog(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _logs.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {}
        for k, v in _logs.items():
            data[k] = v.model_dump(mode="json")
        save_data(FILENAME, data)


_load()


def list_logs(
    operator: Optional[str] = None,
    method: Optional[str] = None,
    section: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    entity_id: Optional[str] = None,
    keyword: Optional[str] = None,
) -> List[OperationLog]:
    logs = list(_logs.values())
    if operator:
        logs = [l for l in logs if l.operator == operator]
    if section:
        logs = [l for l in logs if l.section == section]
    if method:
        if method == "UPDATE":
            logs = [l for l in logs if l.method in ("PUT", "PATCH")]
        else:
            logs = [l for l in logs if l.method == method]
    if entity_id:
        logs = [l for l in logs if l.entity_id == entity_id]
    if keyword:
        kw = keyword.lower()
        logs = [l for l in logs if (
            (l.content and kw in l.content.lower()) or
            (l.before_data and kw in str(l.before_data).lower()) or
            (l.after_data and kw in str(l.after_data).lower())
        )]
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            logs = [l for l in logs if l.created_at >= dt]
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            logs = [l for l in logs if l.created_at <= dt]
        except ValueError:
            pass
    return sorted(logs, key=lambda x: x.created_at, reverse=True)


def create_log(data: OperationLogCreate, extra: dict = None) -> OperationLog:
    now = datetime.now(timezone.utc)
    log = OperationLog(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        **data.model_dump(),
    )
    if extra:
        for key, value in extra.items():
            if hasattr(log, key):
                setattr(log, key, value)
    _logs[log.id] = log
    _save(log.id)
    return log
