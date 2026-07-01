from typing import List
from app.services import storage

FILENAME = "activity_orders.json"

_orders: dict = {}


def _load():
    global _orders
    _orders = storage.load_data(FILENAME)


def _save(key: str):
    storage.save_item(FILENAME, key, _orders.get(key, []))


_load()


def get_order(date: str, space_id: str = "") -> List[str]:
    key = f"{date}:{space_id}" if space_id else date
    return _orders.get(key, [])


def save_order(date: str, space_id: str, order: List[str]):
    key = f"{date}:{space_id}" if space_id else date
    _orders[key] = order
    _save(key)
