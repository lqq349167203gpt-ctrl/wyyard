import uuid
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Optional, Dict

from app.models.membership_card import MembershipCard, MembershipCardCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "membership_cards.json"
DEDUCTIONS_FILE = "membership_deductions.json"
_cards: Dict[str, MembershipCard] = {}
# 追踪已扣费记录：{customer_id: [activity_key, ...]}
_deductions: Dict[str, list] = {}


def _load():
    global _cards, _deductions
    data = load_data(FILENAME)
    _cards = {}
    for k, v in data.items():
        _cards[k] = MembershipCard(**v)
    _deductions = load_data(DEDUCTIONS_FILE) or {}


def _save(card_id: str = ""):
    if card_id:
        item = _cards.get(card_id)
        if item:
            save_item(FILENAME, card_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _cards.items()}
        save_data(FILENAME, data)


def _save_deductions():
    save_data(DEDUCTIONS_FILE, _deductions)


_load()


def _calc_expiry(effective_date: str, duration_type: Optional[str], duration_value: Optional[int]) -> Optional[str]:
    """根据生效日期和时长自动计算到期日期"""
    if not duration_type or not duration_value:
        return None
    try:
        start = datetime.strptime(effective_date, "%Y-%m-%d")
    except ValueError:
        return None
    if duration_type == "day":
        end = start + timedelta(days=duration_value)
    elif duration_type == "month":
        end = start + relativedelta(months=duration_value)
    else:
        return None
    return end.strftime("%Y-%m-%d")


def list_cards() -> List[MembershipCard]:
    return [v for v in _cards.values() if not v.is_deleted]


def get_card(card_id: str) -> Optional[MembershipCard]:
    card = _cards.get(card_id)
    if card and card.is_deleted:
        return None
    return card


def deduct_card(card_id: str, count: int = 1) -> int:
    """扣减指定卡片的剩余次数，返回扣减后的 remaining_count"""
    card = _cards.get(card_id)
    if not card or card.is_deleted:
        raise ValueError("卡片不存在")
    if card.remaining_count is None:
        raise ValueError("该卡为不限次卡，无法销卡")
    if card.remaining_count < count:
        raise ValueError(f"剩余次数不足（剩余 {card.remaining_count} 次）")
    card.remaining_count -= count
    card.updated_at = datetime.now(timezone.utc)
    _cards[card_id] = card
    _save(card_id)
    return card.remaining_count


def create_card(data: MembershipCardCreate) -> MembershipCard:
    now = datetime.now(timezone.utc)
    card_data = data.model_dump()
    # 自动计算到期日期
    card_data["expiry_date"] = _calc_expiry(
        card_data["effective_date"],
        card_data.get("duration_type"),
        card_data.get("duration_value"),
    )
    card = MembershipCard(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **card_data,
    )
    _cards[card.id] = card
    _save(card.id)
    _refresh_member_type(card.customer_id)
    return card


def update_card(card_id: str, data: dict) -> Optional[MembershipCard]:
    card = _cards.get(card_id)
    if not card:
        return None
    for key, value in data.items():
        if hasattr(card, key) and key not in ("id", "created_at"):
            setattr(card, key, value)
    # 重新计算到期日期
    card.expiry_date = _calc_expiry(
        card.effective_date,
        card.duration_type,
        card.duration_value,
    )
    card.updated_at = datetime.now(timezone.utc)
    _cards[card_id] = card
    _save(card_id)
    _refresh_member_type(card.customer_id)
    return card


def delete_card(card_id: str) -> bool:
    card = _cards.get(card_id)
    if not card:
        return False
    customer_id = card.customer_id
    card.is_deleted = True
    card.deleted_at = datetime.now(timezone.utc)
    _save(card_id)
    _refresh_member_type(customer_id)
    return True


def _deduct_one(customer_id: str) -> bool:
    """内部：为指定用户扣除一次会员活动剩余次数（允许负数）"""
    candidates = [
        c for c in _cards.values()
        if c.customer_id == customer_id
        and c.remaining_count is not None
    ]
    if not candidates:
        return False
    # 优先扣有剩余的卡，都没有则扣最新的卡（允许负数）
    positive = [c for c in candidates if c.remaining_count > 0]
    pool = positive if positive else candidates
    pool.sort(key=lambda c: c.created_at, reverse=True)
    card = pool[0]
    card.remaining_count -= 1
    card.updated_at = datetime.now(timezone.utc)
    _cards[card.id] = card
    _save(card.id)
    return True


def _restore_one(customer_id: str) -> bool:
    """内部：为指定用户返还一次会员活动剩余次数"""
    candidates = [
        c for c in _cards.values()
        if c.customer_id == customer_id
        and c.remaining_count is not None
    ]
    if not candidates:
        return False
    candidates.sort(key=lambda c: c.created_at, reverse=True)
    card = candidates[0]
    card.remaining_count += 1
    card.updated_at = datetime.now(timezone.utc)
    _cards[card.id] = card
    _save(card.id)
    return True


def can_deduct(customer_id: str, activity_key: str) -> bool:
    """检查指定用户是否可以扣费（不实际扣减）"""
    if customer_id in _deductions and activity_key in _deductions[customer_id]:
        return True  # 已扣过
    # 检查是否有可用卡（None=不限次，>0=有剩余）
    for c in _cards.values():
        if c.customer_id == customer_id:
            if c.remaining_count is None or c.remaining_count > 0:
                return True
    return False


def deduct_for_activity(customer_id: str, activity_key: str) -> bool:
    """为指定用户在指定活动中扣费（同一活动同一人只扣一次）"""
    if customer_id in _deductions and activity_key in _deductions[customer_id]:
        return True  # 已扣过，跳过
    success = _deduct_one(customer_id)
    if success:
        _deductions.setdefault(customer_id, []).append(activity_key)
        _save_deductions()
    return success


def restore_for_activity(customer_id: str, activity_key: str) -> bool:
    """返还指定用户在指定活动中的扣费"""
    if customer_id not in _deductions or activity_key not in _deductions[customer_id]:
        return False  # 未扣过，无需返还
    success = _restore_one(customer_id)
    _deductions[customer_id].remove(activity_key)
    if not _deductions[customer_id]:
        del _deductions[customer_id]
    _save_deductions()
    return success


def _refresh_member_type(customer_id: str):
    """委托给 member_identity_service 计算身份"""
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(customer_id)


def search_customers(keyword: str) -> list:
    if not keyword:
        return []
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
            })
    return results
