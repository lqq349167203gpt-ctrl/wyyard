from datetime import datetime
from typing import List, Literal, Optional

from pydantic import Field

from app.models.base import SafeBaseModel, StrictBaseModel


class IdentityCondition(SafeBaseModel):
    type: Literal["arrival", "activity", "card", "course", "payment", "teacher", "fixed"]
    payment_categories: List[str] = []
    items: List[str] = []
    count_op: Literal[">", "=", "<"] = ">"
    count_value: int = 0
    validity: Literal["active", "all"] = "active"
    activity_scope: Literal["all", "welfare"] = "all"


class MemberIdentityBase(SafeBaseModel):
    name: str = Field(default="", min_length=1)
    type: Literal["老人", "新人", ""] = ""
    conditions: List[IdentityCondition] = []
    operator: Literal["all", "any"] = "all"
    sort_order: int = 0


class MemberIdentityCreate(MemberIdentityBase):
    pass


class MemberIdentityUpdate(StrictBaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    type: Optional[Literal["老人", "新人", ""]] = None
    conditions: Optional[List[IdentityCondition]] = None
    operator: Optional[Literal["all", "any"]] = None


class MemberIdentity(MemberIdentityBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
