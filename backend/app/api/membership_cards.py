from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import membership_card_service, project_deduction_service
from app.models.membership_card import MembershipCardCreate

router = APIRouter(prefix="/api/membership-cards", tags=["membership-cards"])


@router.get("")
def list_cards(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    items = membership_card_service.list_cards()
    items_dict = [i.model_dump() if hasattr(i, "model_dump") else i for i in items]
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items_dict = [i for i in items_dict if i.get("customer_id") in allowed]
    if nickname:
        kw = nickname.lower()
        items_dict = [i for i in items_dict if kw in (i.get("nickname") or "").lower()]
    if closer_name:
        kw = closer_name.lower()
        items_dict = [i for i in items_dict if kw in (i.get("closer_name") or "").lower() or any(kw in (c.get("name") or "").lower() for c in (i.get("closers") or []))]
    items_dict.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    # 为非不限次卡附加有效剩余次数（总购买 - 该卡销卡次数）
    for item in items_dict:
        if item.get("remaining_count") is None:
            item["effective_remaining"] = None  # 不限次
        else:
            card_id = item.get("id", "")
            card_deduct = project_deduction_service.get_deduction_total_for_project(card_id)
            total = item.get("total_count") or 0
            item["effective_remaining"] = total - card_deduct
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.post("")
def create_card(data: MembershipCardCreate):
    return membership_card_service.create_card(data)


@router.patch("/{card_id}")
def update_card(card_id: str, data: dict):
    # remaining_count 是流水派生的缓存，禁止直接修改
    # total_count 是原始购买次数，允许修正
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
def delete_card(card_id: str):
    if not membership_card_service.delete_card(card_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return membership_card_service.search_customers(q)
