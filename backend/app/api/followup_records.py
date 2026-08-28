from fastapi import APIRouter, HTTPException, Query, Request

from app.services import activity_followup_service, customer_access_service, customer_service

router = APIRouter(prefix="/api/followup-records", tags=["followup-records"])


@router.get("")
def list_followup_records(request: Request, customer_id: str = Query(None)):
    role = getattr(request.state, "user_role", "") or ""
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
    return {
        "items": [record.model_dump(mode="json") for record in records],
        "total": len(records),
    }
