from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class Material(BaseModel):
    id: str
    name: str
    url: str
    size: int = 0


class HealingRecordBase(BaseModel):
    customer_id: str
    customer_name: str = ""
    date: str  # YYYY-MM-DD
    title: str
    growth_record: str = ""
    teacher: str = ""
    materials: List[Material] = []


class HealingRecordCreate(HealingRecordBase):
    pass


class HealingRecordUpdate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    date: Optional[str] = None
    title: Optional[str] = None
    growth_record: Optional[str] = None
    teacher: Optional[str] = None
    materials: Optional[List[Material]] = None


class HealingRecord(HealingRecordBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
