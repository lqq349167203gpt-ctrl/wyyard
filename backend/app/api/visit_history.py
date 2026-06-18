from fastapi import APIRouter, HTTPException
from typing import Optional

from app.models.visit_history import VisitHistoryCreate
from app.services import visit_history_service

router = APIRouter(prefix="/api/visit-history", tags=["visit-history"])


@router.get("")
def list_histories(date: Optional[str] = None, space_id: Optional[str] = None):
    return visit_history_service.list_histories(date=date, space_id=space_id)


@router.post("")
def create_history(data: VisitHistoryCreate):
    return visit_history_service.create_history(data)


@router.delete("/{history_id}")
def delete_history(history_id: str):
    ok = visit_history_service.delete_history(history_id)
    if not ok:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
