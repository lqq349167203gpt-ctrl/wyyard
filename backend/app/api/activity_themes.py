from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional

from app.services import activity_theme_service

router = APIRouter(prefix="/api/activity-themes", tags=["activity-themes"])


class SaveThemeRequest(BaseModel):
    date: str
    space_id: str = ""
    week_theme: str = ""
    day_theme: str = ""


class BatchSaveThemeRequest(BaseModel):
    themes: List[SaveThemeRequest]


@router.get("")
async def list_themes(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    space_ids: Optional[List[str]] = Query(None),
):
    return activity_theme_service.list_themes(start_date, end_date, space_ids)


@router.post("")
async def save_theme(data: SaveThemeRequest):
    return activity_theme_service.save_theme(data.date, data.week_theme, data.day_theme, data.space_id)


@router.post("/batch")
async def batch_save_themes(data: BatchSaveThemeRequest):
    results = []
    for t in data.themes:
        results.append(activity_theme_service.save_theme(t.date, t.week_theme, t.day_theme, t.space_id))
    return results
