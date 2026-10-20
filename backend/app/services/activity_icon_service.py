"""活动大类图标：配置持久化，默认资源随代码发布。"""

from pathlib import Path

from app.services.storage import load_data, save_item

FILENAME = "activity_icons.json"
DEFAULT_DIR = Path(__file__).resolve().parents[1] / "assets" / "activity-icons"
TYPES = {"class": "沙龙活动", "gcs": "觉醒游戏", "ers": "情绪释放", "eks": "深度情绪释放", "ics": "沙龙技能学习"}


def list_icons():
    saved = load_data(FILENAME)
    return [{"key": key, "label": label, "default_url": f"/api/activity-icons/default/{key}",
             "url": (saved.get(key) or {}).get("url") or f"/api/activity-icons/default/{key}",
             "custom": bool((saved.get(key) or {}).get("url"))} for key, label in TYPES.items()]


def set_icon(key: str, url: str):
    save_item(FILENAME, key, {"url": url})
    return next(item for item in list_icons() if item["key"] == key)
