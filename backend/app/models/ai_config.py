from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AIConfigBase(BaseModel):
    name: str
    provider: str  # qwen / kimi / glm / deepseek / xiaomi
    model: str
    api_key: str = ""
    base_url: str = ""
    system_prompt: str = ""


class AIConfigCreate(AIConfigBase):
    pass


class AIConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    system_prompt: Optional[str] = None


class AIConfig(AIConfigBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


# 各模型默认配置
PROVIDER_DEFAULTS = {
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1/",
        "model": "qwen-plus",
    },
    "kimi": {
        "base_url": "https://api.moonshot.cn/v1/",
        "model": "kimi-k2.5",
    },
    "glm": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4/",
        "model": "glm-5",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1/",
        "model": "deepseek-chat",
    },
    "xiaomi": {
        "base_url": "https://api.xiaomi.com/v1/",
        "model": "mimo-v2.5-pro",
    },
}
