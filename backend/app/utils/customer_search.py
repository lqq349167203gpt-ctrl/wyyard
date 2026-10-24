"""昵称搜索统一支持姓名与手机尾号；尾号最多四位，不下发完整手机号。"""
import re
from collections.abc import Mapping


def _value(customer, key):
    return customer.get(key, "") if isinstance(customer, Mapping) else getattr(customer, key, "")


def phone_suffix(customer) -> str:
    value = _value(customer, "phone_suffix") or _value(customer, "phone")
    return re.sub(r"[^0-9]", "", str(value or ""))[-4:]


def matches_customer_search(customer, keyword: str | None) -> bool:
    query = str(keyword or "").strip().casefold()
    if not query:
        return True
    return (any(query in str(_value(customer, key) or "").casefold() for key in ("nickname", "name"))
            or bool(re.fullmatch(r"[0-9]{1,4}", query) and phone_suffix(customer).endswith(query)))


def masked_customer_phone(customer) -> str:
    """搜索候选只返回脱敏号码，与客户详情的联系方式保护规则一致。"""
    from app.services.customer_contact_service import mask_phone

    value = str(_value(customer, "phone") or "")
    digits = re.sub(r"[^0-9]", "", value)
    if len(digits) == 13 and digits.startswith("86"):
        digits = digits[2:]
    return mask_phone(digits if len(digits) == 11 and "*" not in value else value)
