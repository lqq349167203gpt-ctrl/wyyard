import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.activity_history import ActivityHistory, ActivityHistoryCreate
from app.services.storage import load_data, save_data, save_item

FILENAME = "activity_history.json"
_histories: Dict[str, ActivityHistory] = {}


def _load():
    global _histories
    data = load_data(FILENAME)
    _histories = {}
    for k, v in data.items():
        _histories[k] = ActivityHistory(**v)


def _save(item_id: str = ""):
    if item_id:
        item = _histories.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        data = {}
        for k, v in _histories.items():
            data[k] = v.model_dump(mode="json")
        save_data(FILENAME, data)


_load()


def list_histories(
    date: Optional[str] = None,
    space_id: Optional[str] = None,
) -> List[ActivityHistory]:
    items = list(_histories.values())
    if date:
        items = [h for h in items if h.date == date]
    if space_id:
        items = [h for h in items if h.space_id == space_id]
    return sorted(items, key=lambda x: x.created_at, reverse=True)


def create_history(data: ActivityHistoryCreate) -> ActivityHistory:
    now = datetime.now(timezone.utc)
    history = ActivityHistory(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        **data.model_dump(),
    )
    _histories[history.id] = history
    _save(history.id)
    return history


def delete_history(history_id: str) -> bool:
    if history_id not in _histories:
        return False
    del _histories[history_id]
    from app.services.storage import delete_item
    delete_item(FILENAME, history_id)
    return True
