import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.energy_knot import EnergyKnot, EnergyKnotCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "energy_knots.json"
_knots: Dict[str, EnergyKnot] = {}


def _load():
    global _knots
    data = load_data(FILENAME)
    _knots = {}
    for k, v in data.items():
        _knots[k] = EnergyKnot(**v)


def _save(knot_id: str = ""):
    if knot_id:
        item = _knots.get(knot_id)
        if item:
            save_item(FILENAME, knot_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _knots.items()}
        save_data(FILENAME, data)


_load()


def list_knots() -> List[EnergyKnot]:
    return [v for v in _knots.values() if not v.is_deleted]


def get_knot(knot_id: str) -> Optional[EnergyKnot]:
    knot = _knots.get(knot_id)
    if knot and knot.is_deleted:
        return None
    return knot


def create_knot(data: EnergyKnotCreate) -> EnergyKnot:
    now = datetime.now(timezone.utc)
    knot = EnergyKnot(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _knots[knot.id] = knot
    _save(knot.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(knot.customer_id)
    return knot


def update_knot(knot_id: str, data: dict) -> Optional[EnergyKnot]:
    knot = _knots.get(knot_id)
    if not knot:
        return None
    for key, value in data.items():
        if hasattr(knot, key) and key not in ("id", "created_at"):
            setattr(knot, key, value)
    knot.updated_at = datetime.now(timezone.utc)
    _knots[knot_id] = knot
    _save(knot_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(knot.customer_id)
    return knot


def delete_knot(knot_id: str) -> tuple[bool, str]:
    knot = _knots.get(knot_id)
    if not knot:
        return False, "记录不存在"
    # 检查删除后剩余次数是否会变负
    from app.services import energy_knot_session_service
    remaining = energy_knot_session_service.get_remaining_count(knot.customer_id)
    if remaining - knot.purchase_count < 0:
        return False, "该记录中有正在被使用的次数，无法删除"
    knot.is_deleted = True
    knot.deleted_at = datetime.now(timezone.utc)
    _save(knot_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(knot.customer_id)
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
