import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from app.models.ai_config import AIConfig, AIConfigCreate, AIConfigUpdate
from app.services.storage import load_data, save_data, save_item

FILENAME = "ai_configs.json"
_configs: Dict[str, AIConfig] = {}


def _load():
    global _configs
    data = load_data(FILENAME)
    _configs = {k: AIConfig(**v) for k, v in data.items()}


def _save(config_id: str = ""):
    if config_id:
        config = _configs.get(config_id)
        if config:
            save_item(FILENAME, config_id, config.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _configs.items()}
        save_data(FILENAME, data)


_load()


def list_configs() -> List[AIConfig]:
    return [v for v in _configs.values() if not v.is_deleted]


def get_config(config_id: str) -> Optional[AIConfig]:
    config = _configs.get(config_id)
    if config and config.is_deleted:
        return None
    return config


def create_config(data: AIConfigCreate) -> AIConfig:
    now = datetime.now(timezone.utc)
    config = AIConfig(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _configs[config.id] = config
    _save(config.id)
    return config


def update_config(config_id: str, data: AIConfigUpdate) -> Optional[AIConfig]:
    config = _configs.get(config_id)
    if not config:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    config.updated_at = datetime.now(timezone.utc)
    _save(config_id)
    return config


def delete_config(config_id: str) -> bool:
    config = _configs.get(config_id)
    if not config:
        return False
    config.is_deleted = True
    config.deleted_at = datetime.now(timezone.utc)
    _save(config_id)
    return True
