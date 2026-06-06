from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class OrganizationBase(BaseModel):
    name: str
    member_ids: List[str] = []


class OrganizationCreate(OrganizationBase):
    pass


class Organization(OrganizationBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
