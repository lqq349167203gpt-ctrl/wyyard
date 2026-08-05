from datetime import datetime, timezone
from typing import Optional

from app.models.customer_ai_config import CustomerAIConfig, CustomerAIConfigUpdate
from app.services.storage import load_item, save_item

FILENAME = "customer_ai_config.json"
_config: Optional[CustomerAIConfig] = None


def _load():
    global _config
    data = load_item(FILENAME, "default")
    if data:
        _config = CustomerAIConfig(**data)


def _save(item_id: str = ""):
    if _config:
        save_item(FILENAME, "default", _config.model_dump(mode="json"))


_load()


def get_config() -> CustomerAIConfig:
    global _config
    if _config is None:
        now = datetime.now(timezone.utc)
        _config = CustomerAIConfig(
            created_at=now,
            updated_at=now,
        )
        _save("default")
    return _config


def update_config(data: CustomerAIConfigUpdate) -> CustomerAIConfig:
    global _config
    config = get_config()
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    config.updated_at = datetime.now(timezone.utc)
    _save("default")
    return config
