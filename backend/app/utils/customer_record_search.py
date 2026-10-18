"""业务记录按客户 ID 关联当前资料，历史昵称仅作兼容搜索，不作为身份标识。"""

from app.services import customer_service


def customer_record_matcher(keyword: str | None):
    """一次解析客户目录，再匹配记录；调用方须先执行原有可见范围过滤。"""
    query = str(keyword or "").strip().casefold()
    if not query:
        return lambda item: True
    customer_ids = {
        customer.id for customer in customer_service.list_all_customers()
        if query in str(customer.nickname or "").casefold()
        or query in str(customer.name or "").casefold()
    }
    return lambda item: (
        item.get("customer_id") in customer_ids
        or query in str(item.get("nickname") or "").casefold()
    )


def filter_customer_records(items: list[dict], keyword: str | None) -> list[dict]:
    matches = customer_record_matcher(keyword)
    return [item for item in items if matches(item)]
