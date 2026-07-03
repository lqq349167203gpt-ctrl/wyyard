from typing import Optional
from fastapi import APIRouter

from app.services import chat_log_service

router = APIRouter(prefix="/api/chat-logs", tags=["chat-logs"])


@router.get("")
def list_chat_logs(
    operator: Optional[str] = None,
    mode: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    keyword: Optional[str] = None,
):
    return chat_log_service.list_logs(
        operator=operator, mode=mode,
        date_from=date_from, date_to=date_to,
        keyword=keyword,
    )


@router.get("/{log_id}")
def get_chat_log(log_id: str):
    log = chat_log_service.get_log(log_id)
    if not log:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="日志不存在")
    return log
