from datetime import datetime

from app.models.base import SafeBaseModel


class ActivityThemeBase(SafeBaseModel):
    date: str          # YYYY-MM-DD
    space_id: str = ""  # 所属空间，空字符串表示未关联空间
    week_theme: str = ""
    week_theme_detail: str = ""
    day_theme: str = ""
    day_theme_detail: str = ""
    is_locked: bool = False
    locked_by_id: str = ""
    locked_by: str = ""
    locked_at: datetime | None = None


class ActivityThemeCreate(ActivityThemeBase):
    pass


class ActivityTheme(ActivityThemeBase):
    id: str
    created_at: datetime
    updated_at: datetime
