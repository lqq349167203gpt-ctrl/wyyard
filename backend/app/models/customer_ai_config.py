from app.models.base import SafeBaseModel, StrictBaseModel
from datetime import datetime
from typing import Optional


class CustomerAIConfig(SafeBaseModel):
    """客户管理 AI 配置，全局唯一，1:1 强关联"""
    id: str = "default"
    name: str = "客户信息提取"
    provider: str = "glm"
    model: str = "glm-5"
    api_key: str = ""
    base_url: str = "https://open.bigmodel.cn/api/paas/v4/"
    system_prompt: str = ""
    temperature: float = 0
    max_tokens: int = 2048
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CustomerAIConfigUpdate(StrictBaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
