from fastapi import APIRouter, Query, Request
from typing import Optional
from app.services import chat_history_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/chat-history", tags=["chat-history"])


@router.get("")
def list_records(
    request: Request,
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    current_role = getattr(request.state, "user_role", "")
    current_user_id = getattr(request.state, "user_id", "")

    # 非管理员只能查看自己的聊天记录
    if current_role != "超级管理员":
        user_id = current_user_id

    items = chat_history_service.list_records(
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        keyword=keyword,
    )
    # 将 Pydantic 模型转为 dict
    items = [r.model_dump(mode="json") for r in items]
    if page is not None:
        return paginate(items, page, page_size or 20)
    return items
