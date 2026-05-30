from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class ReminderCondition(BaseModel):
    type: str  # "acquaintance_date" | "visit_count" | "activity"
    mode: str  # "fixed_cycle" | "relative" | "participation_count" | "remaining_count"
    operator: str = ""  # "gt" | "eq" | "lt"
    value: int = 0
    activity_type: str = ""  # "membership" | "emotional_release" | "group_case" | "energy_knot" | "internal_course"


class ReminderBase(BaseModel):
    name: str
    account_role: str = "全部"
    account_id: str = "全部"
    condition_logic: str = "all"  # "all" | "any"
    conditions: List[ReminderCondition] = []
    trigger_mode: str = "once"


class ReminderCreate(ReminderBase):
    pass


class Reminder(ReminderBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
