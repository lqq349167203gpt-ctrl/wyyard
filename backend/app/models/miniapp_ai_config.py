from datetime import datetime
from typing import Optional

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class MiniappAIConfig(SafeBaseModel):
    """小程序 AI 共享配置（客户/邀约/课表共用），全局唯一。"""
    id: str = "default"
    provider: str = "glm"
    model: str = "glm-5.2"
    api_key: str = ""
    base_url: str = "https://open.bigmodel.cn/api/paas/v4/"
    temperature: float = Field(default=0.1, ge=0, le=2)
    max_tokens: int = Field(default=2048, ge=1, le=32768)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class MiniappAIConfigUpdate(StrictBaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
