import threading
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from app.models.client_notification import ClientNotification
from app.services.storage import load_data, save_item

FILENAME = "client_notifications.json"
_notifications: dict[str, ClientNotification] = {}
_lock = threading.Lock()


def _load():
    global _notifications
    data = load_data(FILENAME)
    _notifications = {}
    for k, v in data.items():
        _notifications[k] = ClientNotification(**v)


def _save(item_id: str):
    item = _notifications.get(item_id)
    if item:
        save_item(FILENAME, item_id, item.model_dump(mode="json"))


_load()


def create_notification(customer_id: str, type: str, title: str, content: str,
                        activity_name: str = "", activity_date: str = "", operator: str = "") -> ClientNotification:
    nid = str(uuid.uuid4())
    n = ClientNotification(
        id=nid,
        customer_id=customer_id,
        type=type,
        title=title,
        content=content,
        activity_name=activity_name,
        activity_date=activity_date,
        operator=operator,
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )
    with _lock:
        _notifications[nid] = n
        _save(nid)
    return n


def ensure_notification(source_key: str, customer_id: str, type: str, title: str, content: str,
                        created_at: datetime, activity_name: str = "", activity_date: str = "",
                        operator: str = "") -> ClientNotification:
    """按业务来源幂等创建通知；刷新时保留原有已读状态。"""
    notification_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"wyyard:{customer_id}:{source_key}"))
    with _lock:
        existing = _notifications.get(notification_id)
        if existing:
            changed = False
            updates = {
                "type": type,
                "title": title,
                "content": content,
                "activity_name": activity_name,
                "activity_date": activity_date,
                "operator": operator,
                "created_at": created_at,
            }
            for field, value in updates.items():
                if getattr(existing, field) != value:
                    setattr(existing, field, value)
                    changed = True
            if changed:
                _save(notification_id)
            return existing

        notification = ClientNotification(
            id=notification_id,
            customer_id=customer_id,
            type=type,
            title=title,
            content=content,
            activity_name=activity_name,
            activity_date=activity_date,
            operator=operator,
            is_read=False,
            created_at=created_at,
        )
        _notifications[notification_id] = notification
        _save(notification_id)
        return notification


def list_notifications(customer_id: str) -> List[ClientNotification]:
    return sorted(
        [n for n in _notifications.values() if n.customer_id == customer_id],
        key=lambda n: n.created_at,
        reverse=True,
    )


def mark_read(notification_id: str) -> Optional[ClientNotification]:
    n = _notifications.get(notification_id)
    if not n:
        return None
    n.is_read = True
    _save(notification_id)
    return n


def has_unread(customer_id: str) -> bool:
    return any(n.customer_id == customer_id and not n.is_read for n in _notifications.values())
