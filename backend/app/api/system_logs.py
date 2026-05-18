from fastapi import APIRouter
from typing import Optional

from app.models.system_log import SystemLogCreate
from app.services import system_log_service

router = APIRouter(prefix="/api/system-logs", tags=["system-logs"])


@router.get("")
async def list_logs(
    operator: Optional[str] = None,
    method: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    return system_log_service.list_logs(
        operator=operator,
        method=method,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("")
async def create_log(data: SystemLogCreate):
    return system_log_service.create_log(data)
