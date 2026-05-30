from fastapi import APIRouter, Query
from typing import Optional

from app.models.system_log import SystemLogCreate
from app.services import system_log_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/system-logs", tags=["system-logs"])


@router.get("")
async def list_logs(
    operator: Optional[str] = None,
    method: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    items = system_log_service.list_logs(
        operator=operator,
        method=method,
        date_from=date_from,
        date_to=date_to,
    )
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
async def create_log(data: SystemLogCreate):
    return system_log_service.create_log(data)
