from fastapi import APIRouter, HTTPException

from app.models.daily_grouping import DailyGroupingUpsert
from app.services import daily_grouping_service, visit_verification_service

router = APIRouter(prefix="/api/daily-groupings", tags=["daily-groupings"])


@router.get("")
def get_grouping(date: str):
    """获取某日的分组"""
    return daily_grouping_service.get_grouping(date) or {"date": date, "groups": []}


@router.put("")
def upsert_grouping(data: DailyGroupingUpsert):
    """创建或更新某日的分组"""
    visit_verification_service.ensure_date_unverified(data.date)
    try:
        return daily_grouping_service.upsert_grouping(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
