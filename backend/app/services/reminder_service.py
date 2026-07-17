import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from fastapi import HTTPException
from pydantic import ValidationError

from app.models.reminder import Reminder, ReminderCreate, ReminderCondition
from app.services.storage import load_data, save_data, save_item

logger = logging.getLogger(__name__)

FILENAME = "reminders.json"
_reminders: Dict[str, Reminder] = {}


def _load():
    global _reminders
    data = load_data(FILENAME)
    _reminders = {}
    for k, v in data.items():
        # 逐条容错：单条坏数据只跳过并告警，不影响其他数据加载导致后端起不来
        try:
            conditions = [ReminderCondition(**c) for c in v.get("conditions", [])]
            _reminders[k] = Reminder(conditions=conditions, **{key: val for key, val in v.items() if key != "conditions"})
        except (ValidationError, TypeError, AttributeError) as e:
            logger.warning("跳过 reminders.json 中的坏数据行 %s: %s", k, e)


def _save(reminder_id: str = ""):
    if reminder_id:
        reminder = _reminders.get(reminder_id)
        if reminder:
            save_item(FILENAME, reminder_id, reminder.model_dump(mode="json"))
    else:
        data = {}
        for k, v in _reminders.items():
            data[k] = v.model_dump(mode="json")
        save_data(FILENAME, data)


_load()


def list_reminders() -> List[Reminder]:
    return [v for v in _reminders.values() if not v.is_deleted]


def get_reminder(reminder_id: str) -> Optional[Reminder]:
    r = _reminders.get(reminder_id)
    if r and r.is_deleted:
        return None
    return r


def create_reminder(data: ReminderCreate) -> Reminder:
    now = datetime.now(timezone.utc)
    r = Reminder(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _reminders[r.id] = r
    _save(r.id)
    return r


_UPDATE_ALLOWED_KEYS = {"name", "account_role", "account_id", "condition_logic", "conditions", "trigger_mode"}


def update_reminder(reminder_id: str, data: dict) -> Optional[Reminder]:
    r = _reminders.get(reminder_id)
    if not r:
        return None
    # 先在修改后的完整 dict 上重建 pydantic 模型做全量校验，
    # 避免直接 setattr 绕过校验导致非法值（如 trigger_mode='recurring'）落库
    candidate = r.model_dump()
    try:
        for key, value in data.items():
            if key not in _UPDATE_ALLOWED_KEYS:
                continue
            if key == "conditions":
                # conditions 保持现有重建逻辑（元素须符合 ReminderCondition 结构）
                candidate["conditions"] = [ReminderCondition(**c) for c in value]
            else:
                candidate[key] = value
        candidate["updated_at"] = datetime.now(timezone.utc)
        r = Reminder.model_validate(candidate)
    except (ValidationError, TypeError) as e:
        # 校验失败抛 422 等效异常，不写库、不修改内存中的数据
        detail = e.errors(include_context=False, include_url=False) if isinstance(e, ValidationError) else str(e)
        raise HTTPException(status_code=422, detail=f"提醒配置不合法: {detail}")
    _reminders[reminder_id] = r
    _save(reminder_id)
    return r


def delete_reminder(reminder_id: str) -> bool:
    r = _reminders.get(reminder_id)
    if not r:
        return False
    r.is_deleted = True
    r.deleted_at = datetime.now(timezone.utc)
    _save(reminder_id)
    return True
