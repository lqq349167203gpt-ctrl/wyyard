"""Sales 与本场助教授权。客户归属与单笔交易可见范围分别判断。"""

from contextvars import ContextVar

from fastapi import HTTPException

from app.services import customer_access_service, customer_service, position_edit_permission_service
from app.utils.request_roles import get_request_roles

presentation_request = ContextVar("sales_presentation_request", default=None)


def presented(records):
    """仅用于页面投影和统计；业务扣卡、余额重算仍读取完整原始记录。"""
    request = presentation_request.get()
    if request is None or not any(p.get("payment_rules") is not None for _, p in role_grants(request)):
        return records
    return filter_records(request, records, detail=False)


def read(item, key, default=""):
    return item.get(key, default) if isinstance(item, dict) else getattr(item, key, default)


def role_grants(request):
    # 按同一角色的完整规则判断，避免跨角色拼接范围与明细权限。
    cached = getattr(request.state, "sales_role_grants", None)
    if cached is None:
        cached = [(role, position_edit_permission_service.get_permissions(role)) for role in get_request_roles(request)]
        request.state.sales_role_grants = cached
    yield from cached


def is_admin(request):
    return "超级管理员" in get_request_roles(request)


def is_creator(request, record):
    uid = str(getattr(request.state, "user_id", "") or "")
    creator = read(record, "created_by_id")
    if creator:
        return bool(uid and creator == uid)
    return bool(read(record, "created_by") and read(record, "created_by") in actor_names(request))


def actor_names(request):
    names = getattr(request.state, "sales_actor_names", None)
    if names is None:
        names = customer_access_service._actor_names(request)
        request.state.sales_actor_names = names
    return names


def managed(request, role, customer_id):
    from app.models.customer import customer_referrers
    customer = customer_service.get_customer(customer_id)
    if not customer:
        return False
    permissions = next(p for single, p in role_grants(request) if single == role)["customer_access"]
    if permissions["scope"] == "all":
        return True
    if permissions["scope"] != "related":
        return False
    relations = permissions["relations"]
    for name in actor_names(request):
        if not name:
            continue
        if any(relations.values()) and customer_access_service._is_account_owner(name, customer):
            return True
        if relations.get("referrer") and name in customer_referrers(customer):
            return True
        if relations.get("referrer_handler") and customer.referrer_handler.strip() == name:
            return True
        if relations.get("service_teacher") and customer.service_teacher.strip() == name:
            return True
    return False


def role_can_view(request, record, role, permissions, *, detail=True):
    access = permissions["customer_access"]["transaction_access"]
    if access == "none" or (detail and access != "detail"):
        return False
    rules = permissions.get("payment_rules")
    customer_visible = managed(request, role, read(record, "customer_id"))
    if rules is None:
        return customer_visible or bool(read(record, "entry_course_key") and is_creator(request, record))
    if (rules["view_managed"] and customer_visible) or (rules["view_own"] and is_creator(request, record)):
        return True
    if rules["view_own"] and read(record, "project_id"):
        from app.services.payment_sources import PAYMENT_TYPES, list_payment_records
        kind = read(record, "project_type")
        if kind in PAYMENT_TYPES:
            cache = getattr(request.state, "sales_order_sources", {})
            if kind not in cache:
                cache[kind] = {row.id: row for row in list_payment_records(kind)}
                request.state.sales_order_sources = cache
            parent = cache[kind].get(read(record, "project_id"))
            return bool(parent and read(parent, "customer_id") == read(record, "customer_id") and is_creator(request, parent))
    return False


def can_view(request, record, *, detail=True):
    return is_admin(request) or any(role_can_view(request, record, role, p, detail=detail) for role, p in role_grants(request))


def filter_records(request, records, *, detail=True):
    return [record for record in records if can_view(request, record, detail=detail)]


def require_view(request, record):
    if not can_view(request, record):
        raise HTTPException(403, "没有查看该交易的权限")


def assistant_course(request, key, customer_id="", *, writing=True):
    from app.services import activity_lock_service, course_workflow_guard_service

    uid = getattr(request.state, "user_id", "")
    courses = getattr(request.state, "sales_courses", None)
    if courses is None:
        courses = {f"{source}:{record.id}": record for source, _, record in course_workflow_guard_service.courses()}
        request.state.sales_courses = courses
    course = courses.get(key)
    if course is None:
        return None
    if course.is_deleted:
        return None
    if not uid or uid not in course.assistant_account_ids:
        return None
    from app.services import account_service
    account = account_service.get_account(uid)
    if not account or not account.enabled:
        return None
    from app.services import position_permission_service
    allowed = any(p.get("course_assistant", {}).get("eligible")
                  and p.get("course_assistant", {}).get("payment_entry")
                  and p["customer_access"]["transaction_access"] == "detail"
                  and "daily-activities" in position_permission_service.get_permissions(role)
                  for role, p in role_grants(request))
    if not allowed:
        return None
    if writing:
        try:
            activity_lock_service.ensure_record_unlocked(course)
        except HTTPException:
            return None
    if customer_id and customer_id not in (
        course_workflow_guard_service.registered(course) - set(course.withdrawn_participant_ids or [])
        - set(getattr(course, "teacher_ids", []) or [])
        - {getattr(course, "host_id", ""), getattr(course, "achiever_id", "")}
    ):
        return None
    return course


def require_create(request, data):
    customer_id = read(data, "customer_id")
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(404, "客户不存在")
    if is_admin(request):
        return
    if read(data, "card_type") == "粗门次卡" and any(p.get("payment_rules") is not None for _, p in role_grants(request)):
        raise HTTPException(403, "粗门次卡需通过独立的课程抵扣入口登记")
    key = read(data, "deal_course_key")
    if read(data, "entry_course_key"):
        if customer.is_deleted:
            raise HTTPException(404, "客户已停用")
        if read(data, "card_type") == "粗门次卡":
            raise HTTPException(403, "粗门抵扣请使用独立的抵扣权限与入口")
        if read(data, "entry_course_key") != key or not assistant_course(request, key, customer_id):
            raise HTTPException(403, "本场助教授权已失效，或该客户不在有效课程名单中")
        request.state.payment_entry_course = key
        return
    for role, p in role_grants(request):
        rules = p.get("payment_rules")
        if customer.is_deleted and rules is not None:
            continue
        if p["customer_access"]["transaction_access"] == "detail" and (rules is None or rules["create"]) and managed(request, role, customer_id):
            return
    raise HTTPException(403, "只能为管理范围内客户录入交易；助教请从本场名单录入")


def can_manage(request, record, action="edit"):
    if is_admin(request):
        return True
    customer = customer_service.get_customer(read(record, "customer_id"))
    if not customer:
        return False
    key = read(record, "entry_course_key")
    for role, p in role_grants(request):
        if p["customer_access"]["transaction_access"] != "detail":
            continue
        rules = p.get("payment_rules")
        if customer.is_deleted and (rules is not None or key):
            continue
        scope = rules[action] if rules is not None else p["payments"]
        if scope == "view" or (scope == "own" and not is_creator(request, record)):
            continue
        if rules is not None and not role_can_view(request, record, role, p):
            continue
        if managed(request, role, customer.id):
            return True
        if key and is_creator(request, record) and assistant_course(request, key, customer.id):
            return True
    return False


def require_manage(request, record, action="edit"):
    if not can_manage(request, record, action):
        if all(p.get("payment_rules") is None for _, p in role_grants(request)) and not is_creator(request, record):
            raise HTTPException(403, "只能修改或删除自己创建的付费记录")
        raise HTTPException(403, "没有修改或删除该交易的权限；归属或本场助教授权可能已变更")


def decorate(request, item):
    if hasattr(item, "model_dump"):
        item = item.model_dump(mode="json")
    return {**item, "can_edit": can_manage(request, item), "can_delete": can_manage(request, item, "delete"),
            "can_view_customer": bool(customer_service.get_customer(item.get("customer_id", ""))
                                      and customer_access_service.can_view_customer_for_request(request, customer_service.get_customer(item["customer_id"])))}


def require_sales_assignment(request, previous, incoming):
    if "service_teacher" not in incoming or incoming["service_teacher"] == read(previous, "service_teacher"):
        return
    if is_admin(request) or any(p.get("sales_assign") or "sales" in p.get("work_todos", {}).get("assign", []) for _, p in role_grants(request)):
        return
    raise HTTPException(403, "没有分配或调整Sales的权限")


def require_financial_action(request, page):
    """新交易配置不隐含退款、人工销卡等独立业务页面的操作授权。"""
    from app.services import position_permission_service
    if not is_admin(request) and any(p.get("payment_rules") is not None for _, p in role_grants(request)):
        if page not in position_permission_service.get_permissions(get_request_roles(request)):
            raise HTTPException(403, "没有该财务操作的独立权限")
