from datetime import datetime, timezone
from typing import Optional

from app.models.visit_ai_config import VisitAIConfig, VisitAIConfigUpdate
from app.services.storage import load_item, save_item

FILENAME = "visit_ai_config.json"
_config: Optional[VisitAIConfig] = None


def _load():
    global _config
    data = load_item(FILENAME, "default")
    if data:
        _config = VisitAIConfig(**data)


def _save(item_id: str = ""):
    if _config:
        save_item(FILENAME, "default", _config.model_dump(mode="json"))


_load()


def get_config() -> VisitAIConfig:
    global _config
    if _config is None:
        now = datetime.now(timezone.utc)
        _config = VisitAIConfig(
            created_at=now,
            updated_at=now,
        )
    return _config


def update_config(data: VisitAIConfigUpdate) -> VisitAIConfig:
    global _config
    config = get_config()
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    config.updated_at = datetime.now(timezone.utc)
    _save("default")
    return config
