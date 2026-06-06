from pydantic import BaseModel
from datetime import datetime


class ActivityThemeBase(BaseModel):
    date: str          # YYYY-MM-DD
    week_theme: str = ""
    day_theme: str = ""


class ActivityThemeCreate(ActivityThemeBase):
    pass


class ActivityTheme(ActivityThemeBase):
    id: str
    created_at: datetime
    updated_at: datetime
