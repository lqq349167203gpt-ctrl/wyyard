import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.tea_seat_fee import TeaSeatFee, TeaSeatFeeCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "tea_seat_fees.json"
_fees: Dict[str, TeaSeatFee] = {}


def _migrate_closers(item: TeaSeatFee):
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]


def _load():
    global _fees
    data = load_data(FILENAME)
    _fees = {}
    for k, v in data.items():
        fee = TeaSeatFee(**v)
        _migrate_closers(fee)
        _fees[k] = fee


def _save(fee_id: str = ""):
    if fee_id:
        item = _fees.get(fee_id)
        if item:
            save_item(FILENAME, fee_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _fees.items()}
        save_data(FILENAME, data)


_load()


def list_fees() -> List[TeaSeatFee]:
    return [v for v in _fees.values() if not v.is_deleted]


def get_fee(fee_id: str) -> Optional[TeaSeatFee]:
    fee = _fees.get(fee_id)
    if fee and fee.is_deleted:
        return None
    return fee


def create_fee(data: TeaSeatFeeCreate) -> TeaSeatFee:
    now = datetime.now(timezone.utc)
    fee = TeaSeatFee(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _fees[fee.id] = fee
    _save(fee.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(fee.customer_id)
    return fee


def update_fee(fee_id: str, data: dict) -> Optional[TeaSeatFee]:
    fee = _fees.get(fee_id)
    if not fee or fee.is_deleted:
        return None
    for key, value in data.items():
        if hasattr(fee, key) and key not in ("id", "created_at", "created_by"):
            setattr(fee, key, value)
    fee.updated_at = datetime.now(timezone.utc)
    _fees[fee_id] = fee
    _save(fee_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(fee.customer_id)
    return fee


def delete_fee(fee_id: str) -> tuple[bool, str]:
    fee = _fees.get(fee_id)
    if not fee:
        return False, "记录不存在"
    fee.is_deleted = True
    fee.deleted_at = datetime.now(timezone.utc)
    _save(fee_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(fee.customer_id)
    return True, "删除成功"


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
