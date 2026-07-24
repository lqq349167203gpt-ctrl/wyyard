import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.system_log import SystemLog, SystemLogCreate
from app.services.storage import load_data, save_data, save_item

logger = logging.getLogger(__name__)

FILENAME = "system_logs.json"
_logs: Dict[str, SystemLog] = {}


def _load():
    global _logs
    data = load_data(FILENAME)
    _logs = {}
    for k, v in data.items():
        try:
            _logs[k] = SystemLog(**v)
        except Exception:
            # 修复 created_at 格式问题（空格替换为 T，+08 补全为 +08:00）
            if "created_at" in v and isinstance(v["created_at"], str):
                ca = v["created_at"]
                if " " in ca and "T" not in ca:
                    ca = ca.replace(" ", "T", 1)
                if ca.endswith("+08"):
                    ca = ca + ":00"
                elif ca.endswith("-08"):
                    ca = ca + ":00"
                v["created_at"] = ca
            try:
                _logs[k] = SystemLog(**v)
            except Exception as e:
                logger.warning("跳过无效日志 %s: %s", k, e)


def _save(log_id: str = ""):
    if log_id:
        log = _logs.get(log_id)
        if log:
            save_item(FILENAME, log_id, log.model_dump(mode="json"))
    else:
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
        logs = [log for log in logs if operator.lower() in log.operator.lower()]
    if method:
        if method == "PUT":
            logs = [log for log in logs if log.method in ("PUT", "PATCH")]
        else:
            logs = [log for log in logs if log.method == method]
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


def create_log(data: SystemLogCreate, extra: dict = None) -> SystemLog:
    now = datetime.now(timezone.utc)
    log = SystemLog(
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
