from typing import List, Optional

from fastapi import APIRouter, Query

from app.models.base import StrictBaseModel
from app.services import activity_theme_service

router = APIRouter(prefix="/api/activity-themes", tags=["activity-themes"])


class SaveThemeRequest(StrictBaseModel):
    date: str
    space_id: str = ""
    week_theme: str = ""
    week_theme_detail: str = ""
    day_theme: str = ""
    day_theme_detail: str = ""


class BatchSaveThemeRequest(StrictBaseModel):
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
    return activity_theme_service.save_theme(
        data.date,
        data.week_theme,
        data.day_theme,
        data.space_id,
        data.week_theme_detail,
        data.day_theme_detail,
    )


@router.post("/batch")
async def batch_save_themes(data: BatchSaveThemeRequest):
    results = []
    for t in data.themes:
        results.append(
            activity_theme_service.save_theme(
                t.date,
                t.week_theme,
                t.day_theme,
                t.space_id,
                t.week_theme_detail,
                t.day_theme_detail,
            )
        )
    return results
