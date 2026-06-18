from fastapi import APIRouter, HTTPException
from typing import Optional

from app.models.activity_history import ActivityHistoryCreate
from app.services import activity_history_service

router = APIRouter(prefix="/api/activity-history", tags=["activity-history"])


@router.get("")
def list_histories(date: Optional[str] = None, space_id: Optional[str] = None):
    return activity_history_service.list_histories(date=date, space_id=space_id)


@router.post("")
def create_history(data: ActivityHistoryCreate):
    return activity_history_service.create_history(data)


@router.delete("/{history_id}")
def delete_history(history_id: str):
    ok = activity_history_service.delete_history(history_id)
    if not ok:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
