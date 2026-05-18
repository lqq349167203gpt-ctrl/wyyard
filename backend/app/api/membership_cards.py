from fastapi import APIRouter, HTTPException
from app.services import membership_card_service
from app.models.membership_card import MembershipCardCreate

router = APIRouter(prefix="/api/membership-cards", tags=["membership-cards"])


@router.get("")
def list_cards():
    return membership_card_service.list_cards()


@router.post("")
def create_card(data: MembershipCardCreate):
    return membership_card_service.create_card(data)


@router.patch("/{card_id}")
def update_card(card_id: str, data: dict):
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
