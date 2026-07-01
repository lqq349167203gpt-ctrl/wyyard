import uuid
import threading
from datetime import datetime, timezone
from typing import Optional, List, Dict

from app.models.customer import Customer, CustomerCreate, CustomerUpdate
from app.services.storage import load_data, save_data, save_item

FILENAME = "customers.json"
_customers: Dict[str, Customer] = {}
_customer_lock = threading.Lock()


def _load():
    """从文件加载数据"""
    global _customers
    data = load_data(FILENAME)
    _customers = {k: Customer(**v) for k, v in data.items()}


def _save(customer_id: str = ""):
    if customer_id:
        item = _customers.get(customer_id)
        if item:
            save_item(FILENAME, customer_id, item.model_dump(mode="json"))
    else:
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


def get_by_phone(phone: str) -> Optional[Customer]:
    """按手机号查找客户"""
    for customer in _customers.values():
        if customer.phone == phone and not customer.is_deleted:
            return customer
    return None


def create_customer(data: CustomerCreate) -> Customer:
    with _customer_lock:
        # 检查昵称和微信号唯一性
        for c in _customers.values():
            if c.is_deleted:
                continue
            if data.nickname and c.nickname == data.nickname:
                raise ValueError("昵称已存在")
            if data.wechat and c.wechat == data.wechat:
                raise ValueError("微信号已存在")
            if data.phone and c.phone == data.phone:
                raise ValueError("手机号已存在")

        now = datetime.now(timezone.utc)
        customer = Customer(
            id=str(uuid.uuid4())[:12],
            created_at=now,
            updated_at=now,
            **data.model_dump(),
        )
        _customers[customer.id] = customer
        _save(customer.id)
    # 锁外调用，避免 refresh_member_type → update_customer 死锁
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(customer.id)
    return customer


def update_customer(customer_id: str, data: CustomerUpdate) -> Optional[Customer]:
    with _customer_lock:
        customer = _customers.get(customer_id)
        if not customer or customer.is_deleted:
            return None
        update_data = data.model_dump(exclude_unset=True)

        # 检查昵称、微信号、手机号唯一性（排除自身，忽略空值）
        new_nickname = update_data.get("nickname")
        new_wechat = update_data.get("wechat")
        new_phone = update_data.get("phone")
        if new_nickname or new_wechat or new_phone:
            for c in _customers.values():
                if c.is_deleted or c.id == customer_id:
                    continue
                if new_nickname and c.nickname == new_nickname:
                    raise ValueError("昵称已存在")
                if new_wechat and c.wechat == new_wechat:
                    raise ValueError("微信号已存在")
                if new_phone and c.phone == new_phone:
                    raise ValueError("手机号已存在")

        for key, value in update_data.items():
            setattr(customer, key, value)
        customer.updated_at = datetime.now(timezone.utc)
        _save(customer_id)
        need_refresh = "positions" in update_data
    # 锁外调用，避免 refresh_member_type → update_customer 死锁
    if need_refresh:
        try:
            from app.services.member_identity_service import refresh_member_type
            refresh_member_type(customer_id)
        except Exception:
            pass
    return customer


def delete_customer(customer_id: str) -> bool:
    with _customer_lock:
        customer = _customers.get(customer_id)
        if not customer:
            return False
        if customer.is_deleted:
            return True  # 幂等：已删除返回 True
        customer.is_deleted = True
        customer.deleted_at = datetime.now(timezone.utc)
        _save(customer_id)
    # 锁外调用，避免死锁
    try:
        from app.services.member_identity_service import refresh_member_type
        refresh_member_type(customer_id)
    except Exception:
        pass
    return True


def restore_customer(customer_id: str) -> Optional[Customer]:
    """恢复已软删除的客户"""
    with _customer_lock:
        customer = _customers.get(customer_id)
        if not customer or not customer.is_deleted:
            return None
        # 恢复前检查手机号唯一性
        if customer.phone:
            for c in _customers.values():
                if c.phone == customer.phone and not c.is_deleted and c.id != customer_id:
                    raise ValueError(f"手机号 {customer.phone} 已被其他客户使用，无法恢复")
        customer.is_deleted = False
        customer.deleted_at = None
        customer.updated_at = datetime.now(timezone.utc)
        _save(customer_id)
    # 锁外调用
    try:
        from app.services.member_identity_service import refresh_member_type
        refresh_member_type(customer_id)
    except Exception:
        pass
    return customer
