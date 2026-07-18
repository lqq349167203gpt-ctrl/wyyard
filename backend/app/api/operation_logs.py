from typing import Optional

from fastapi import APIRouter, Query

from app.services import operation_log_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/operation-logs", tags=["operation-logs"])


@router.get("")
def list_logs(
    operator: Optional[str] = None,
    method: Optional[str] = None,
    section: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    entity_id: Optional[str] = None,
    keyword: Optional[str] = None,
    source: Optional[str] = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    items = operation_log_service.list_logs(
        operator=operator,
        method=method,
        section=section,
        date_from=date_from,
        date_to=date_to,
        entity_id=entity_id,
        keyword=keyword,
        source=source,
    )
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items
