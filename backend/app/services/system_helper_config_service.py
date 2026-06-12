from datetime import datetime, timezone
from typing import Optional

from app.models.system_helper_config import SystemHelperConfig, SystemHelperConfigUpdate
from app.services.storage import load_data, save_item

FILENAME = "system_helper_config.json"
_config: Optional[SystemHelperConfig] = None


def _load():
    global _config
    data = load_data(FILENAME)
    if data:
        _config = SystemHelperConfig(**data)


def _save():
    if _config:
        save_item(FILENAME, "default", _config.model_dump(mode="json"))


_load()


def get_config() -> SystemHelperConfig:
    global _config
    if _config is None:
        now = datetime.now(timezone.utc)
        _config = SystemHelperConfig(
            created_at=now,
            updated_at=now,
        )
    return _config


def update_config(data: SystemHelperConfigUpdate) -> SystemHelperConfig:
    global _config
    config = get_config()
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    config.updated_at = datetime.now(timezone.utc)
    _save()
    return config
