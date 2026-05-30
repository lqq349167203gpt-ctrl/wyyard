import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.system_log import SystemLog, SystemLogCreate
from app.services.storage import load_data, save_data

FILENAME = "system_logs.json"
_logs: Dict[str, SystemLog] = {}


def _load():
    global _logs
    data = load_data(FILENAME)
    _logs = {}
    for k, v in data.items():
        _logs[k] = SystemLog(**v)


def _save():
    data = {}
    for k, v in _logs.items():
        data[k] = v.model_dump(mode="json")
    save_data(FILENAME, data)


_load()


def list_logs(
    operator: Optional[str] = None,
    method: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[SystemLog]:
    logs = list(_logs.values())
    if operator:
        logs = [l for l in logs if operator.lower() in l.operator.lower()]
    if method:
        if method == "PUT":
            logs = [l for l in logs if l.method in ("PUT", "PATCH")]
        else:
            logs = [l for l in logs if l.method == method]
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


def create_log(data: SystemLogCreate, extra: dict = None) -> SystemLog:
    now = datetime.now(timezone.utc)
    log = SystemLog(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        **data.model_dump(),
    )
    if extra:
        for key, value in extra.items():
            if hasattr(log, key):
                setattr(log, key, value)
    _logs[log.id] = log
    _save()
    return log
