from fastapi import APIRouter, HTTPException, Query, Request

from app.models.membership_card import MembershipCardCreate
from app.services import customer_access_service, membership_card_service
from app.utils.pagination import paginate
from app.utils.payment_validation import ensure_payment_closer_total
from app.utils.record_ownership import ensure_payment_record_manager, stamp_payment_creator

router = APIRouter(prefix="/api/membership-cards", tags=["membership-cards"])


@router.get("")
def list_cards(request: Request, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None), card_type: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = membership_card_service.list_cards()
    items_dict = [i.model_dump() if hasattr(i, "model_dump") else i for i in items]
    items_dict = customer_access_service.filter_record_dicts(request, items_dict)
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items_dict = [i for i in items_dict if i.get("customer_id") in allowed]
    if nickname:
        kw = nickname.lower()
        items_dict = [i for i in items_dict if kw in (i.get("nickname") or "").lower()]
    if closer_name:
        kw = closer_name.lower()
        items_dict = [i for i in items_dict if kw in (i.get("closer_name") or "").lower() or any(kw in (c.get("name") or "").lower() for c in (i.get("closers") or []))]
    if card_type:
        items_dict = [i for i in items_dict if i.get("card_type") == card_type]
    items_dict.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    # 统一使用 service 层计算有效剩余（总购买 - 销卡 - 活动扣卡）
    for item in items_dict:
        card_id = item.get("id", "")
        item["effective_remaining"] = membership_card_service.get_card_effective_remaining(card_id)
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    customer_access_service.require_transaction_access(request, detail=True)
    return customer_access_service.filter_customer_search_results(
        request, membership_card_service.search_customers(q)
    )


@router.get("/{card_id}")
def get_card(card_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    card = membership_card_service.get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, card.customer_id)
    item = card.model_dump() if hasattr(card, "model_dump") else card
    item["effective_remaining"] = membership_card_service.get_card_effective_remaining(card_id)
    return item


@router.post("")
def create_card(data: MembershipCardCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    ensure_payment_closer_total(data, "price", request=request)
    return membership_card_service.create_card(stamp_payment_creator(data, request))


@router.patch("/{card_id}")
def update_card(card_id: str, data: dict, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    # remaining_count 正常情况下禁止直接修改（由流水派生）
    # 但卡类型变更时需要重置 remaining_count / total_count
    old_card = membership_card_service.get_card(card_id)
    if not old_card:
        raise HTTPException(status_code=404, detail="记录不存在")
    ensure_payment_record_manager(request, old_card)
    data.pop("created_by", None)
    data.pop("created_by_id", None)
    customer_access_service.require_customer_scope(request, old_card.customer_id, action="修改")
    if data.get("customer_id") and data["customer_id"] != old_card.customer_id:
        customer_access_service.require_customer_scope(request, data["customer_id"], action="新增付费项目到")
    ensure_payment_closer_total(data, "price", old_card, request)
    card_type_changed = "card_type" in data and old_card and data["card_type"] != old_card.card_type
    if not card_type_changed:
        forbidden = {"remaining_count"}
        violated = forbidden & set(data.keys())
        if violated:
            raise HTTPException(
                status_code=400,
                detail=f"不允许直接修改次数字段：{','.join(sorted(violated))}。请通过销卡或活动扣卡流水操作。",
            )
    card = membership_card_service.update_card(card_id, data)
    if not card:
        raise HTTPException(status_code=404, detail="记录不存在")
    return card


@router.delete("/{card_id}")
def delete_card(card_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    card = membership_card_service.get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="记录不存在")
    ensure_payment_record_manager(request, card)
    customer_access_service.require_customer_scope(request, card.customer_id, action="删除")
    if not membership_card_service.delete_card(card_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}
