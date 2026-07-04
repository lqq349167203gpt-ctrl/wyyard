import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.activity_registration import ActivityRegistration, ActivityRegistrationCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "activity_registrations.json"
_registrations: Dict[str, ActivityRegistration] = {}


def _load():
    global _registrations
    data = load_data(FILENAME)
    _registrations = {k: ActivityRegistration(**v) for k, v in data.items()}


def _save(reg_id: str = ""):
    if reg_id:
        item = _registrations.get(reg_id)
        if item:
            save_item(FILENAME, reg_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _registrations.items()}
        save_data(FILENAME, data)


_load()


def list_my_registrations(customer_id: str) -> List[ActivityRegistration]:
    """获取客户的所有有效报名"""
    return sorted(
        [r for r in _registrations.values()
         if r.customer_id == customer_id and not r.is_deleted],
        key=lambda r: r.activity_date,
        reverse=True,
    )


def is_registered(customer_id: str, activity_id: str) -> Optional[ActivityRegistration]:
    """检查客户是否已报名某活动"""
    for r in _registrations.values():
        if r.customer_id == customer_id and r.activity_id == activity_id and not r.is_deleted:
            return r
    return None


def register(customer_id: str, data: ActivityRegistrationCreate) -> ActivityRegistration:
    """客户报名活动"""
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise ValueError("客户不存在")

    existing = is_registered(customer_id, data.activity_id)
    if existing:
        raise ValueError("已报名该活动")

    now = datetime.now(timezone.utc)
    reg = ActivityRegistration(
        id=str(uuid.uuid4())[:8],
        customer_id=customer_id,
        nickname=customer.nickname,
        activity_type=data.activity_type,
        activity_id=data.activity_id,
        activity_name=data.activity_name,
        activity_date=data.activity_date,
        status="pending",
        created_at=now,
    )
    _registrations[reg.id] = reg
    _save(reg.id)
    return reg


def cancel(registration_id: str, customer_id: str) -> bool:
    """取消报名（客户只能取消自己的）"""
    reg = _registrations.get(registration_id)
    if not reg or reg.is_deleted or reg.customer_id != customer_id:
        return False
    reg.status = "cancelled"
    reg.updated_at = datetime.now(timezone.utc)
    _registrations[registration_id] = reg
    _save(registration_id)
    return True
