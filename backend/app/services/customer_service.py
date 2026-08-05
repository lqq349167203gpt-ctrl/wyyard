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


def list_disabled_customers() -> List[Customer]:
    """列出所有已停用（软删除）的客户"""
    return [v for v in _customers.values() if v.is_deleted]


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


def validate_customer_data(data: CustomerCreate, exclude_id: str = "") -> Optional[str]:
    """校验客户数据是否能保存，返回错误信息或 None（可保存）。
    exclude_id: 修改时排除自身。"""
    for c in _customers.values():
        if c.is_deleted:
            continue
        if exclude_id and c.id == exclude_id:
            continue
        if data.nickname and c.nickname == data.nickname:
            return f"昵称「{data.nickname}」已存在"
        if data.wechat and c.wechat == data.wechat:
            return f"微信号「{data.wechat}」已存在"
        if data.phone and c.phone == data.phone:
            return f"手机号「{data.phone}」已存在"
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


def _cleanup_customer_from_activities(customer_id: str):
    """从所有活动记录中移除指定客户的 ID"""
    from app.services.storage import load_data, save_item

    activity_files = [
        "class_records.json",
        "group_case_sessions.json",
        "emotional_release_sessions.json",
        "energy_knot_sessions.json",
        "internal_course_sessions.json",
        "oh_card_reading_sessions.json",
    ]

    for filename in activity_files:
        try:
            records = load_data(filename)
            for record_id, data in records.items():
                changed = False
                if customer_id in (data.get("participant_ids") or []):
                    data["participant_ids"] = [pid for pid in data["participant_ids"] if pid != customer_id]
                    changed = True
                if customer_id in (data.get("teacher_ids") or []):
                    data["teacher_ids"] = [tid for tid in data["teacher_ids"] if tid != customer_id]
                    changed = True
                if data.get("host_id") == customer_id:
                    data["host_id"] = ""
                    changed = True
                if data.get("owner_id") == customer_id:
                    data["owner_id"] = ""
                    data["owner_name"] = ""
                    changed = True
                for g in (data.get("groups") or []):
                    if g.get("leader_id") == customer_id:
                        g["leader_id"] = ""
                        changed = True
                    if g.get("deputy_id") == customer_id:
                        g["deputy_id"] = ""
                        changed = True
                    if customer_id in (g.get("member_ids") or []):
                        g["member_ids"] = [mid for mid in g["member_ids"] if mid != customer_id]
                        changed = True
                if changed:
                    save_item(filename, record_id, data)
        except Exception:
            pass


def cleanup_all_deleted_customers():
    """清理所有已删除客户在活动记录中的引用（一次性修复）"""
    deleted_ids = [cid for cid, c in _customers.items() if c.is_deleted]
    for cid in deleted_ids:
        _cleanup_customer_from_activities(cid)
    return len(deleted_ids)


def delete_customer(customer_id: str, deleted_by: str = "") -> bool:
    """归档客户（软删除）：仅标记 is_deleted，不清理任何关联数据。
    课程、邀约、消费、销卡记录全部保留，恢复后自动可见。"""
    with _customer_lock:
        customer = _customers.get(customer_id)
        if not customer:
            return False
        if customer.is_deleted:
            return True  # 幂等：已归档返回 True
        customer.is_deleted = True
        customer.deleted_at = datetime.now(timezone.utc)
        customer.deleted_by = deleted_by
        _save(customer_id)
    # 锁外调用
    try:
        from app.services.member_identity_service import refresh_member_type
        refresh_member_type(customer_id)
    except Exception:
        pass
    return True


def permanent_delete_customer(customer_id: str) -> tuple[bool, str]:
    """彻底删除客户。仅当客户没有任何关联记录（课程/邀约/消费/销卡）时才允许。
    返回 (成功, 错误信息)。"""
    from app.services.storage import load_data

    # 检查邀约记录
    visits = load_data("visits.json")
    for v in visits.values():
        if v.get("customer_id") == customer_id and not v.get("is_deleted"):
            return False, "该客户有关联邀约记录，无法彻底删除。请使用归档功能。"

    # 检查消费/付费记录
    payment_files = [
        "membership_cards.json", "group_cases.json", "emotional_releases.json",
        "oh_card_readings.json", "energy_knots.json", "internal_courses.json",
        "other_projects.json",
    ]
    for fn in payment_files:
        try:
            records = load_data(fn)
            for r in records.values():
                if r.get("customer_id") == customer_id and not r.get("is_deleted"):
                    return False, "该客户有关联付费记录，无法彻底删除。请使用归档功能。"
        except Exception:
            pass

    # 检查销卡记录
    try:
        deductions = load_data("project_deductions.json")
        for d in deductions.values():
            if d.get("customer_id") == customer_id and not d.get("is_deleted"):
                return False, "该客户有关联销卡记录，无法彻底删除。请使用归档功能。"
    except Exception:
        pass

    # 检查活动参与
    activity_files = [
        "class_records.json", "group_case_sessions.json",
        "emotional_release_sessions.json", "energy_knot_sessions.json",
        "internal_course_sessions.json", "oh_card_reading_sessions.json",
    ]
    for fn in activity_files:
        try:
            records = load_data(fn)
            for r in records.values():
                if r.get("is_deleted"):
                    continue
                if customer_id in (r.get("participant_ids") or []):
                    return False, "该客户有关联活动记录，无法彻底删除。请使用归档功能。"
                if customer_id in (r.get("teacher_ids") or []):
                    return False, "该客户有关联活动记录，无法彻底删除。请使用归档功能。"
                if r.get("host_id") == customer_id or r.get("owner_id") == customer_id:
                    return False, "该客户有关联活动记录，无法彻底删除。请使用归档功能。"
        except Exception:
            pass

    # 无关联记录，允许彻底删除
    with _customer_lock:
        customer = _customers.get(customer_id)
        if not customer:
            return False, "客户不存在"
        _cleanup_customer_from_activities(customer_id)
        del _customers[customer_id]
        save_data(FILENAME, {k: v.model_dump(mode="json") for k, v in _customers.items()})
    return True, ""


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
