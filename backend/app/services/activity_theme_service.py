from datetime import datetime
from typing import Dict, List, Optional
import uuid

from app.models.activity_theme import ActivityTheme, ActivityThemeCreate
from app.services import storage

FILENAME = "activity_themes.json"

_themes: Dict[str, ActivityTheme] = {}


def _load():
    global _themes
    data = storage.load_data(FILENAME)
    _themes = {}
    for key, val in data.items():
        _themes[key] = ActivityTheme(**val)


def _save(item_id: str = ""):
    if item_id:
        t = _themes[item_id]
        storage.save_item(FILENAME, item_id, t.model_dump(mode="json"))
    else:
        storage.save_data(FILENAME, {k: v.model_dump(mode="json") for k, v in _themes.items()})


_load()


def list_themes(start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[ActivityTheme]:
    result = list(_themes.values())
    if start_date:
        result = [t for t in result if t.date >= start_date]
    if end_date:
        result = [t for t in result if t.date <= end_date]
    result.sort(key=lambda t: t.date)
    return result


def save_theme(date: str, week_theme: str, day_theme: str) -> ActivityTheme:
    """按 date upsert，同一天的 week_theme 会覆盖整周"""
    existing = _themes.get(date)
    now = datetime.now()
    if existing:
        existing.week_theme = week_theme
        existing.day_theme = day_theme
        existing.updated_at = now
        _save(date)
        return existing
    else:
        theme = ActivityTheme(
            id=date,
            date=date,
            week_theme=week_theme,
            day_theme=day_theme,
            created_at=now,
            updated_at=now,
        )
        _themes[date] = theme
        _save(date)
        return theme


def get_theme(date: str) -> Optional[ActivityTheme]:
    return _themes.get(date)
