from app.models.base import SafeBaseModel
from datetime import datetime
from typing import List, Optional


class OrganizationBase(SafeBaseModel):
    name: str
    member_ids: List[str] = []
    sort_order: int = 0


class OrganizationCreate(OrganizationBase):
    pass


class Organization(OrganizationBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
