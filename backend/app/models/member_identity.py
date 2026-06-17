from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class IdentityCondition(BaseModel):
    type: str  # "arrival" | "activity" | "card" | "course" | "payment"
    payment_categories: List[str] = []  # for payment type
    items: List[str] = []  # card/course 的子项
    count_op: str = ">"  # ">" | "=" | "<"
    count_value: int = 0  # 比较值
    validity: str = "active"  # 仅 card/course："active" | "all"


class MemberIdentityBase(BaseModel):
    name: str = ""
    type: str = ""  # "老人" | "新人" | ""
    conditions: List[IdentityCondition] = []
    operator: str = "all"  # "all" | "any"
    sort_order: int = 0


class MemberIdentityCreate(MemberIdentityBase):
    pass


class MemberIdentityUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    conditions: Optional[List[IdentityCondition]] = None
    operator: Optional[str] = None
    sort_order: Optional[int] = None


class MemberIdentity(MemberIdentityBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
