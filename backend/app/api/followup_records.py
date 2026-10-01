from fastapi import APIRouter, HTTPException, Query, Request

from app.services import activity_followup_service, customer_access_service, customer_service
from app.utils.pagination import paginate
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/followup-records", tags=["followup-records"])


@router.get("")
def list_followup_records(
    request: Request, customer_id: str = Query(None),
    page: int | None = Query(None, ge=1), page_size: int = Query(10, ge=1, le=100),
):
    role = get_request_roles(request)
    if not customer_access_service.can_view_detail_tab(role, "customer_followups"):
        raise HTTPException(status_code=403, detail="没有查看客户回访的权限")
    visible_ids = customer_access_service.visible_customer_ids(request, customer_service.list_customers())
    if customer_id and customer_id not in visible_ids:
        raise HTTPException(status_code=403, detail="没有查看该客户的权限")
    records = [
        record
        for record in activity_followup_service.list_followups(customer_id or "")
        if record.customer_id in visible_ids
    ]
    if page is not None:
        result = paginate(records, page, page_size)
        return {**result, "items": [r.model_dump(mode="json") for r in result["items"]]}
    return {
        "items": [record.model_dump(mode="json") for record in records],
        "total": len(records),
    }
