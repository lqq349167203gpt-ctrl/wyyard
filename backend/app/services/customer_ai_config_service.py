from datetime import datetime, timezone
from typing import Optional

from app.models.customer_ai_config import CustomerAIConfig, CustomerAIConfigUpdate
from app.models.ai_config import PROVIDER_DEFAULTS
from app.services.storage import load_data, save_item

FILENAME = "customer_ai_config.json"
_config: Optional[CustomerAIConfig] = None


def _load():
    global _config
    data = load_data(FILENAME)
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


def apply_provider_defaults(provider: str) -> dict:
    """根据厂商返回默认配置"""
    return PROVIDER_DEFAULTS.get(provider, {})
