from app.models.base import SafeBaseModel
from datetime import datetime
from typing import Optional, Any


class OperationLogBase(SafeBaseModel):
    section: str  # 板块名称
    content: str  # 操作内容


class OperationLogCreate(OperationLogBase):
    pass


class OperationLog(OperationLogBase):
    id: str
    operator: str = ""  # 操作人
    operator_role: str = ""  # 操作人角色
    method: str = ""  # HTTP 方法
    path: str = ""  # 请求路径
    entity_id: str = ""  # 被操作的实体 ID
    ip: str = ""  # 客户端 IP
    before_data: Optional[Any] = None  # 修改前数据快照
    after_data: Optional[Any] = None  # 修改后数据快照
    created_at: datetime
