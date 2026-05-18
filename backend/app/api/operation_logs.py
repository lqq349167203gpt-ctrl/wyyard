from fastapi import APIRouter
from typing import Optional
from app.services import operation_log_service

router = APIRouter(prefix="/api/operation-logs", tags=["operation-logs"])


@router.get("")
def list_logs(
    operator: Optional[str] = None,
    method: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    entity_id: Optional[str] = None,
    keyword: Optional[str] = None,
):
    return operation_log_service.list_logs(
        operator=operator,
        method=method,
        date_from=date_from,
        date_to=date_to,
        entity_id=entity_id,
        keyword=keyword,
    )
