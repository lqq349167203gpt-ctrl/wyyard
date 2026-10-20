"""管理账号的本人会员视图；不接受客户端指定客户或手机号。"""

from fastapi import HTTPException

from app.services import account_service, customer_service

UNBOUND_MESSAGE = "该账号未绑定客户信息"


def management_account_for(customer):
    """手机号已验证的客户，仅在归属关系唯一且可反向确认时关联管理账号。"""
    names = {(customer.nickname or "").strip(), (customer.name or "").strip()} - {""}
    accounts = [a for a in account_service.list_accounts()
                if a.enabled and not a.is_deleted and (a.owner or "").strip() in names]
    if len(accounts) != 1:
        return None
    linked = resolve_customer(accounts[0].id)
    return accounts[0] if linked and linked.id == customer.id else None


def customer_for_phone(phone: str):
    matches = [c for c in customer_service.list_customers()
               if not c.is_deleted and (c.phone or "").strip() == phone.strip()]
    return matches[0] if phone.strip() and len(matches) == 1 else None


def resolve_customer(account_id: str):
    account = account_service.get_account(account_id)
    if not account or not account.enabled:
        raise HTTPException(403, "无可用的管理端账号")
    owner = (account.owner or "").strip()
    if not owner:
        return None
    customers = [c for c in customer_service.list_customers() if not c.is_deleted]
    # 与现有手机号员工登录的“客户姓名/昵称 → 账号归属人”关系一致；重名不猜测。
    candidates = [c for c in customers if owner in {(c.nickname or "").strip(), (c.name or "").strip()}]
    if len(candidates) != 1:
        return None
    customer = candidates[0]
    phone = (customer.phone or "").strip()
    if not phone:
        return None
    matches = [c for c in customers if (c.phone or "").strip() == phone]
    return customer if len(matches) == 1 else None


def read_member_data(account_id: str, section: str, page: int, page_size: int):
    customer = resolve_customer(account_id)
    return _read_customer(customer, section, page, page_size, can_manage=True)


def read_customer_member_data(customer_id: str, section: str, page: int, page_size: int):
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted or not customer.phone or customer_for_phone(customer.phone) is None:
        customer = None
    can_manage = bool(customer and management_account_for(customer))
    return _read_customer(customer, section, page, page_size, can_manage=can_manage)


def _read_customer(customer, section: str, page: int, page_size: int, *, can_manage: bool):
    from app.api.customer_detail import _build_activities, _build_payment_records, _build_purchase_summary
    from app.utils.pagination import paginate

    if customer is None:
        return {"bound": False, "message": UNBOUND_MESSAGE, "can_manage": can_manage}
    result = {"bound": True, "can_manage": can_manage,
              "customer": {"nickname": customer.nickname or customer.name, "member_type": customer.member_type, "card_status": getattr(customer, "card_status", ""), "card_status_tone": getattr(customer, "card_status_tone", "neutral")}}
    if section == "home":
        from app.services import visit_service

        purchases = _build_purchase_summary(customer.id)
        membership = next((item for item in purchases if item.get("type") == "会员卡"), {})
        activities = _build_activities(customer.id)
        result.update({
            "purchase_summary": purchases,
            "stats": {"visit_count": visit_service.count_customer_visits(customer.id),
                      "activity_count": len(activities),
                      "remaining": membership.get("current_remaining", 0)},
        })
        result.update(paginate(activities, 1, 7))
    elif section == "cards":
        result["items"] = _build_purchase_summary(customer.id)
    elif section == "transactions":
        result.update(paginate(_build_payment_records(customer.id), page, page_size))
    elif section == "checkins":
        from app.services import activity_checkin_service, storage

        result.update(paginate(_build_activities(customer.id), page, page_size))
        for item in result["items"]:
            event = storage.load_item(activity_checkin_service.FILENAME, f'{customer.id}:{item["activity_key"]}')
            item["checked"] = bool(event)
            item["checked_at"] = event["checked_at"] if event else ""
    else:
        result.update(paginate(_build_activities(customer.id), page, page_size))
    return result
