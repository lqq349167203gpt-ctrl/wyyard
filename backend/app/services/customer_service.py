import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from app.models.customer import Customer, CustomerCreate, CustomerUpdate
from app.services.storage import load_data, save_data

FILENAME = "customers.json"
_customers: Dict[str, Customer] = {}


def _load():
    """从文件加载数据"""
    global _customers
    data = load_data(FILENAME)
    _customers = {k: Customer(**v) for k, v in data.items()}


def _save():
    """保存数据到文件"""
    data = {k: v.model_dump(mode="json") for k, v in _customers.items()}
    save_data(FILENAME, data)


# 启动时加载数据
_load()


def list_customers() -> List[Customer]:
    return [v for v in _customers.values() if not v.is_deleted]


def get_customer(customer_id: str) -> Optional[Customer]:
    customer = _customers.get(customer_id)
    if customer and customer.is_deleted:
        return None
    return customer


def create_customer(data: CustomerCreate) -> Customer:
    now = datetime.now(timezone.utc)
    customer = Customer(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _customers[customer.id] = customer
    _save()
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(customer.id)
    return customer


def update_customer(customer_id: str, data: CustomerUpdate) -> Optional[Customer]:
    customer = _customers.get(customer_id)
    if not customer:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(customer, key, value)
    customer.updated_at = datetime.now(timezone.utc)
    _save()
    return customer


def delete_customer(customer_id: str) -> bool:
    customer = _customers.get(customer_id)
    if not customer:
        return False
    customer.is_deleted = True
    customer.deleted_at = datetime.now(timezone.utc)
    _save()
    return True
