"""协议以每张会员卡为单位，沿用客户范围、交易明细与付费编辑权限。"""
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.base import SafeBaseModel
from app.services import customer_access_service, membership_card_service, organization_service
from app.utils.pagination import paginate
from app.utils.record_ownership import ensure_payment_record_manager

router = APIRouter(prefix="/api/agreement-signings", tags=["agreement-signings"],
                   dependencies=[Depends(require_page_permission("agreement-signings"))])


class AgreementStatusUpdate(SafeBaseModel):
    # 兼容旧客户端传空对象时的「确认已签」操作。
    agreement_status: Literal["unsigned", "signed"] = "signed"


@router.get("")
def list_agreements(request: Request, tab: Literal["unsigned", "signed"] = "unsigned",
                    nickname: str = "", page: int = Query(1, ge=1),
                    page_size: int = Query(20, ge=1, le=100)):
    customer_access_service.require_transaction_access(request, detail=True)
    today = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d")
    cards = [c for c in membership_card_service.list_cards()
             if not c.voided and membership_card_service.requires_agreement(c.card_type)]
    visible = customer_access_service.filter_record_dicts(request, [c.model_dump() for c in cards])
    organizations = {o.id: o.name for o in organization_service.list_organizations()}
    counts = {"unsigned": 0, "signed": 0}
    rows = []
    for item in visible:
        if nickname.strip().lower() not in (item.get("nickname") or "").lower():
            continue
        card = membership_card_service.get_card(item["id"])
        period = membership_card_service.agreement_period(card, today)
        status = card.agreement_status or "unsigned"
        bucket = "unsigned" if status == "unsigned" and period == "有效期内" else "signed"
        counts[bucket] += 1
        if bucket != tab:
            continue
        try:
            ensure_payment_record_manager(request, card)
            can_change_status = True
            can_sign = status == "unsigned"
        except HTTPException as exc:
            if exc.status_code != 403:
                raise
            can_sign = False
            can_change_status = False
        rows.append({key: item.get(key) for key in (
            "id", "customer_id", "nickname", "card_type", "deal_date", "effective_date", "expiry_date",
        )} | {
            "agreement_status": status, "period": period, "can_sign": can_sign,
            "can_change_status": can_change_status,
            "organization_name": organizations.get(card.organization_id, ""),
            "closer_names": "、".join(c.get("name", "") for c in card.closers) or card.closer_name or "",
        })
    rows.sort(key=lambda row: (row["deal_date"] or "", row["id"]), reverse=True)
    return {**paginate(rows, page, page_size), "counts": counts}


@router.patch("/{card_id}")
def sign_agreement(card_id: str, request: Request, data: AgreementStatusUpdate | None = None):
    customer_access_service.require_transaction_access(request, detail=True)
    card = membership_card_service.get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="会员卡不存在")
    customer_access_service.require_customer_scope(request, card.customer_id, action="修改")
    ensure_payment_record_manager(request, card)
    previous_status = card.agreement_status or "unsigned"
    target_status = data.agreement_status if data else "signed"
    if not membership_card_service.update_agreement_status(card_id, target_status):
        raise HTTPException(status_code=400, detail="此会员卡不支持签订协议")
    if previous_status == target_status:
        request.state.skip_operation_log = True
    else:
        request.state.operation_log_context = {
            "entity_id": card.id,
            "content": f"{'确认协议已签' if target_status == 'signed' else '协议改为未签'}：{card.nickname} · {card.card_type}",
            "before_data": {"agreement_status": previous_status},
            "after_data": {"agreement_status": target_status},
        }
    return {"id": card.id, "agreement_status": card.agreement_status}
