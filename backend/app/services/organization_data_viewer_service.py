"""全局「整体数据查阅人」配置：配置后默认属于每个组织，可查看所有组织的主理人数据。"""

from typing import List

from app.services.storage import load_item, save_item

FILENAME = "organization_data_viewers.json"
ITEM_ID = "default"

_data_viewer_ids: List[str] = []


def _load() -> None:
    global _data_viewer_ids
    data = load_item(FILENAME, ITEM_ID)
    raw = data.get("data_viewer_ids") if isinstance(data, dict) else None
    _data_viewer_ids = (
        [str(item) for item in raw if item] if isinstance(raw, list) else []
    )


_load()


def list_data_viewer_ids() -> List[str]:
    return list(_data_viewer_ids)


def set_data_viewer_ids(ids: List[str]) -> List[str]:
    global _data_viewer_ids
    _data_viewer_ids = list(dict.fromkeys(str(item) for item in ids if item))
    save_item(FILENAME, ITEM_ID, {"data_viewer_ids": _data_viewer_ids})
    return list(_data_viewer_ids)


def is_data_viewer(customer_id: str) -> bool:
    return bool(customer_id) and customer_id in _data_viewer_ids
