from datetime import datetime
from typing import Optional
from .base import SafeBaseModel


class CommunicationRecordBase(SafeBaseModel):
    customer_nickname: str  # 用户昵称
    content: str  # 沟通记录内容


class CommunicationRecordCreate(CommunicationRecordBase):
    pass


class CommunicationRecord(CommunicationRecordBase):
    id: str
    creator: str = ""  # 创建人
    created_at: datetime
