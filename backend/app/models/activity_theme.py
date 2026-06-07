from pydantic import BaseModel
from datetime import datetime


class ActivityThemeBase(BaseModel):
    date: str          # YYYY-MM-DD
    space_id: str = ""  # 所属空间，空字符串表示未关联空间
    week_theme: str = ""
    day_theme: str = ""


class ActivityThemeCreate(ActivityThemeBase):
    pass


class ActivityTheme(ActivityThemeBase):
    id: str
    created_at: datetime
    updated_at: datetime
