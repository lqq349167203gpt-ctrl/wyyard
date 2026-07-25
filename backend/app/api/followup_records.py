from fastapi import APIRouter, Query
from app.services import activity_followup_service

router = APIRouter(prefix="/api/followup-records", tags=["followup-records"])


@router.get("")
def list_followup_records(customer_id: str = Query(None)):
    records = activity_followup_service.list_followups(customer_id or "")
    return {
        "items": [record.model_dump(mode="json") for record in records],
        "total": len(records),
    }
