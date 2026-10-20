from datetime import datetime
from typing import List, Literal, Optional

from pydantic import Field, model_validator

from app.models.base import SafeBaseModel, StrictBaseModel
from app.utils.payment_types import normalize_card_type


class IdentityCondition(SafeBaseModel):
    type: Literal["invitation", "arrival", "activity", "card", "course", "payment", "teacher", "fixed", "amount", "remaining"]
    payment_categories: List[str] = []
    items: List[str] = []
    count_op: Literal[">", "=", "<", ">=", "<="] = ">"
    count_value: int = 0
    validity: Literal["active", "all"] = "active"
    activity_scope: Literal["all", "welfare"] = "all"
    # 邀约情况：active＝正常邀约（未取消），cancelled＝已取消的邀约；与是否到店无关
    invitation_scope: Literal["active", "cancelled"] = "active"
    remaining_state: Literal["range", "unlimited", "never", "expired", "pending", "voided"] = "range"
    remaining_min: int = Field(default=0, ge=0)
    remaining_max: Optional[int] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def normalize_card_items(self):
        if self.type == "remaining" and self.remaining_max is not None and self.remaining_max < self.remaining_min:
            raise ValueError("剩余次数的上限不能小于下限")
        self.payment_categories = [{"内部课程": "沙龙技能学习", "能量结": "深度情绪释放"}.get(item, item) for item in self.payment_categories]
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
    group: Literal["identity", "card_status"] = "identity"
    tone: Literal["neutral", "warning"] = "neutral"

    @model_validator(mode="after")
    def validate_card_status(self):
        if self.group == "card_status" and (len(self.conditions) != 1 or self.conditions[0].type != "remaining"):
            raise ValueError("卡次标签需配置一条剩余卡次规则")
        return self


class MemberIdentityCreate(MemberIdentityBase):
    pass


class MemberIdentityUpdate(StrictBaseModel):
    group: Optional[Literal["identity", "card_status"]] = None
    name: Optional[str] = Field(default=None, min_length=1)
    type: Optional[Literal["老人", "新人", ""]] = None
    conditions: Optional[List[IdentityCondition]] = None
    operator: Optional[Literal["all", "any"]] = None
    tone: Optional[Literal["neutral", "warning"]] = None


class MemberIdentity(MemberIdentityBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
