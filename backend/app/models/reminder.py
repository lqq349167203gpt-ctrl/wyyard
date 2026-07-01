from app.models.base import SafeBaseModel
from datetime import datetime
from typing import Optional, List, Literal


class ReminderCondition(SafeBaseModel):
    type: Literal["acquaintance_date", "visit_count", "activity"]
    mode: Literal["fixed_cycle", "relative", "participation_count", "remaining_count"]
    operator: Literal["gt", "eq", "lt", ""] = ""
    value: int = 0
    activity_type: Literal["", "membership", "emotional_release", "group_case", "energy_knot", "internal_course"] = ""


class ReminderBase(SafeBaseModel):
    name: str
    account_role: str = "全部"
    account_id: str = "全部"
    condition_logic: Literal["all", "any"] = "all"
    conditions: List[ReminderCondition] = []
    trigger_mode: Literal["once", "every_time"] = "once"


class ReminderCreate(ReminderBase):
    pass


class Reminder(ReminderBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
