"""升单配置：若干「大类」（名字 + 一组付费项目），数组顺序即升单先后顺序。"""

import threading
import uuid

from app.models.upsell_config import UpsellLevel
from app.services.storage import load_data, save_data

UPSELL_FILE = "upsell_levels.json"

_lock = threading.RLock()
_levels: list[UpsellLevel] = []


def _load() -> None:
    global _levels
    raw = load_data(UPSELL_FILE)
    # 一条整体配置：id 固定为 order，方便整体覆盖保存
    stored = raw.get("order") or {}
    _levels = [UpsellLevel(**item) for item in stored.get("levels", [])]


_load()


def list_levels() -> list[dict]:
    return [level.model_dump(mode="json") for level in _levels]


def replace_levels(levels: list[UpsellLevel]) -> list[dict]:
    """整体保存：前端一次提交排好序的大类列表。"""
    with _lock:
        normalized: list[UpsellLevel] = []
        for level in levels:
            level_id = level.id or uuid.uuid4().hex[:12]
            normalized.append(level.model_copy(update={"id": level_id}))
        global _levels
        _levels = normalized
        save_data(UPSELL_FILE, {"order": {"levels": [level.model_dump(mode="json") for level in _levels]}})
    return list_levels()


def parse_item(item: str) -> tuple[str, str]:
    """把配置项拆成（付费项目, 卡种）；卡种为空表示这个大项下的所有卡种。"""
    product, _, subtype = item.partition(":")
    return product, subtype


def level_order() -> list[list[tuple[str, str]]]:
    """按升单顺序返回每一档包含的项目，每项是（付费项目, 卡种）。"""
    return [[parse_item(item) for item in level.products] for level in _levels]
