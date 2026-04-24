from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class SyncStatus(str, Enum):
    SYNCED = "synced"
    PENDING = "pending"
    FAILED = "failed"


class FeishuTable(BaseModel):
    id: str
    name: str
    app_token: str
    table_id: str
    record_count: int = 0
    sync_status: SyncStatus = SyncStatus.PENDING
    last_synced_at: datetime | None = None


class FeishuTableCreate(BaseModel):
    name: str
    app_token: str
    table_id: str
