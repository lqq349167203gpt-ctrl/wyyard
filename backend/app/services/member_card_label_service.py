"""两套标签共用的剩余卡次口径；按数据版本和日期刷新，读取不改写客户或权限。"""

from datetime import datetime
from threading import RLock
from zoneinfo import ZoneInfo

from app.services.storage import data_revision

_lock = RLock()
_cache_key = None
_balance_cache = {}
_label_cache = {}


def invalidate():
    global _cache_key
    with _lock:
        _cache_key = None


def _today():
    return datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()


def _prepare():
    global _cache_key, _balance_cache, _label_cache
    key = (data_revision(), _today())
    if key != _cache_key:
        _cache_key, _balance_cache, _label_cache = key, {}, {}


def _balances(items):
    from app.services import membership_card_service

    types = tuple(sorted(set(items)))
    if types in _balance_cache:
        return _balance_cache[types]
    cards = [card for card in membership_card_service.list_cards() if not types or card.card_type in types]
    customers = {card.customer_id for card in cards}
    remaining = membership_card_service.list_current_card_remaining(customers, card_types=set(types) or None, on_date=_cache_key[1])
    by_customer = {}
    for card in cards:
        by_customer.setdefault(card.customer_id, []).append(card)
    balances = {}
    for customer_id, history in by_customer.items():
        value = remaining.get(customer_id)
        if customer_id in remaining:
            state = "unlimited" if value == "unlimited" else "range"
        else:
            valid = [card for card in history if not card.voided]
            if not valid:
                state = "voided"
            elif any(card.effective_date and card.effective_date > _cache_key[1] for card in valid):
                state = "pending"
            else:
                state = "expired"
        balances[customer_id] = (state, value)
    _balance_cache[types] = balances
    return balances


def matches_condition(condition, customer_id):
    with _lock:
        _prepare()
        state, remaining = _balances(condition.items).get(customer_id, ("never", None))
        if state != condition.remaining_state:
            return False
        return state != "range" or (
            remaining >= condition.remaining_min
            and (condition.remaining_max is None or remaining <= condition.remaining_max)
        )


def label_for(customer_id):
    from app.services.member_identity_service import list_identities

    with _lock:
        _prepare()
        if customer_id not in _label_cache:
            result = {"card_status": "", "card_status_tone": "neutral"}
            for identity in list_identities("card_status"):
                if matches_condition(identity.conditions[0], customer_id):
                    result = {"card_status": identity.name, "card_status_tone": identity.tone}
                    break
            _label_cache[customer_id] = result
        return dict(_label_cache[customer_id])
