from datetime import datetime, timezone
from typing import Optional

from app.models.activity_ai_config import ActivityAIConfig, ActivityAIConfigUpdate
from app.services.storage import load_data, save_item

FILENAME = "activity_ai_config.json"
_config: Optional[ActivityAIConfig] = None


def _load():
    global _config
    data = load_data(FILENAME)
    if data:
        _config = ActivityAIConfig(**data)


def _save(item_id: str = ""):
    if _config:
        save_item(FILENAME, "default", _config.model_dump(mode="json"))


_load()


def get_config() -> ActivityAIConfig:
    global _config
    if _config is None:
        now = datetime.now(timezone.utc)
        _config = ActivityAIConfig(
            created_at=now,
            updated_at=now,
        )
    return _config


def update_config(data: ActivityAIConfigUpdate) -> ActivityAIConfig:
    global _config
    config = get_config()
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    config.updated_at = datetime.now(timezone.utc)
    _save("default")
    return config
