from fastapi import APIRouter, Query, Request

from app.services import (
    customer_access_service,
    emotional_release_session_service,
    energy_knot_session_service,
    group_case_session_service,
    membership_card_service,
)

router = APIRouter(prefix="/api/debt-records", tags=["debt-records"])


@router.get("")
async def list_debt_records(request: Request, type: str = Query(..., description="欠卡类型: membership_card, group_case, emotional_release, energy_knot")):
    customer_access_service.require_transaction_access(request, detail=True)
    if type == "membership_card":
        items = membership_card_service.list_debt_records()
    elif type == "group_case":
        items = group_case_session_service.list_debt_customers()
    elif type == "emotional_release":
        items = emotional_release_session_service.list_debt_customers()
    elif type == "energy_knot":
        items = energy_knot_session_service.list_debt_customers()
    else:
        items = []
    return customer_access_service.filter_record_dicts(request, items)
