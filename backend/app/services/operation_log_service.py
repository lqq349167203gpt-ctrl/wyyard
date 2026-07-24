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
    source: Optional[str] = None,
) -> List[OperationLog]:
    logs = list(_logs.values())
    if operator:
        # 兼容旧数据：operator 字段可能存的是 username 或 owner
        from app.services import account_service
        accounts = account_service.list_accounts()
        owner_usernames = {a.username for a in accounts if a.owner == operator}
        logs = [log for log in logs if log.operator == operator or (owner_usernames and log.operator in owner_usernames)]
    if section:
        logs = [log for log in logs if log.section == section]
    if method:
        if method == "UPDATE":
            logs = [log for log in logs if log.method in ("PUT", "PATCH")]
        else:
            logs = [log for log in logs if log.method == method]
    if entity_id:
        logs = [log for log in logs if log.entity_id == entity_id]
    if source:
        logs = [log for log in logs if log.source == source]
    if keyword:
        kw = keyword.lower()
        logs = [log for log in logs if log.content and kw in log.content.lower()]
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            logs = [log for log in logs if log.created_at >= dt]
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            logs = [log for log in logs if log.created_at <= dt]
        except ValueError:
            pass
    return sorted(logs, key=lambda x: x.created_at, reverse=True)


def create_log(data: OperationLogCreate, extra: dict = None) -> OperationLog:
    now = datetime.now(timezone.utc)
    log = OperationLog(
        id=str(uuid.uuid4())[:12],
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
