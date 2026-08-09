from fastapi import APIRouter, Query

from app.services import (
    membership_card_service,
    group_case_session_service,
    emotional_release_session_service,
    energy_knot_session_service,
)

router = APIRouter(prefix="/api/debt-records", tags=["debt-records"])


@router.get("")
async def list_debt_records(type: str = Query(..., description="欠卡类型: membership_card, group_case, emotional_release, energy_knot")):
    if type == "membership_card":
        return membership_card_service.list_debt_records()
    elif type == "group_case":
        return group_case_session_service.list_debt_customers()
    elif type == "emotional_release":
        return emotional_release_session_service.list_debt_customers()
    elif type == "energy_knot":
        return energy_knot_session_service.list_debt_customers()
    return []
