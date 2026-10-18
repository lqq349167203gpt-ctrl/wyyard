from datetime import datetime
from typing import List, Literal, Optional

from pydantic import Field, model_validator

from app.models.base import SafeBaseModel, StrictBaseModel
from app.utils.payment_types import normalize_card_type


class IdentityCondition(SafeBaseModel):
    type: Literal["invitation", "arrival", "activity", "card", "course", "payment", "teacher", "fixed", "amount"]
    payment_categories: List[str] = []
    items: List[str] = []
    count_op: Literal[">", "=", "<", ">=", "<="] = ">"
    count_value: int = 0
    validity: Literal["active", "all"] = "active"
    activity_scope: Literal["all", "welfare"] = "all"
    # 邀约情况：active＝正常邀约（未取消），cancelled＝已取消的邀约；与是否到店无关
    invitation_scope: Literal["active", "cancelled"] = "active"

    @model_validator(mode="after")
    def normalize_card_items(self):
        self.payment_categories = ["沙龙技能学习" if item == "内部课程" else item for item in self.payment_categories]
        if self.type == "card" or (self.type == "payment" and "会员卡" in self.payment_categories):
            legacy = {"月卡", "12次卡", "3月卡", "半年卡", "年卡", "常规通卡"}
            only_cards = self.type == "card" or set(self.payment_categories) == {"会员卡"}
            self.items = list(dict.fromkeys(normalize_card_type(item) if only_cards or item in legacy else item for item in self.items))
        return self


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
