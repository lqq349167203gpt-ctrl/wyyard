"""主理人组织经营数据。所有分析先裁剪组织与客户范围，再进行关联。"""

import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.models.principal import PrincipalQuery
from app.services import (
    account_service,
    course_service,
    course_type_service,
    customer_access_service,
    customer_service,
    emotional_release_service,
    energy_knot_service,
    group_case_service,
    internal_course_service,
    membership_card_service,
    offline_course_service,
    oh_card_reading_service,
    organization_service,
    other_project_service,
    position_edit_permission_service,
    project_deduction_service,
    tea_seat_fee_service,
    visit_service,
)
from app.services.principal_conversion_service import calculate_conversion
from app.utils.request_roles import get_request_roles

PRODUCTS = (
    ("membership", "会员卡", membership_card_service.list_cards, "card_type"),
    ("group_case", "觉醒游戏", group_case_service.list_cases, ""),
    ("emotional", "情绪释放", emotional_release_service.list_releases, ""),
    ("energy", "能量结", energy_knot_service.list_knots, ""),
    ("oh", "OH卡", oh_card_reading_service.list_readings, ""),
    ("internal", "内部课程", internal_course_service.list_courses, "course_type"),
    ("other", "其他项目", other_project_service.list_projects, "project_name"),
    ("tea", "茶位费", tea_seat_fee_service.list_fees, ""),
    ("offline", "线下课程", offline_course_service.list_courses, "course_name"),
)


def scope(request):
    organizations = organization_service.list_organizations()
    customers = customer_service.list_customers()
    permissions = position_edit_permission_service.get_permissions(get_request_roles(request))
    if permissions["principal_scope"] != "all":
        account = account_service.get_account(getattr(request.state, "user_id", ""))
        owner = (getattr(account, "owner", "") or "").strip()
        matches = [c.id for c in customers if owner and owner in {c.nickname, c.name}]
        # 旧账号以归属人姓名关联客户；同名歧义不得扩大组织权限。
        member_id = matches[0] if len(matches) == 1 else None
        organizations = [o for o in organizations if member_id and member_id in o.member_ids]
    visible = customer_access_service.visible_customer_ids(request, customers)
    return organizations, {c.id: c for c in customers if c.id in visible}, permissions


def selected_orgs(organizations, requested: str) -> set[str]:
    allowed = {o.id for o in organizations}
    if requested and requested not in allowed:
        raise HTTPException(403, "无权查看该组织的主理人数据")
    return {requested} if requested else allowed


def valid_day(value) -> str:
    try:
        return date.fromisoformat(str(value or "")[:10]).isoformat()
    except ValueError:
        return ""


def collect_data(request):
    from app.api.statistics import (
        COURSE_ACTIVITY_TYPES,
        _course_activity_hours,
        _course_activity_name,
        _course_activity_teacher_ids,
        _course_owner_details,
        _course_participant_ids,
    )

    organizations, customers, permissions = scope(request)
    org_names = {o.id: o.name for o in organizations}
    all_orgs = organization_service.list_organizations()
    member_orgs = defaultdict(set)
    for org in all_orgs:
        for member_id in org.member_ids:
            member_orgs[member_id].add(org.id)
    configured_courses = {c.id: c.organization_id for c in course_service.list_courses()}
    configured_types = {c["name"]: c.get("organization_id", "") for c in course_type_service.list_course_types()}
    events, courses = [], []
    def customer_name(cid):
        return (customers[cid].nickname or customers[cid].name or "未命名") if cid in customers else ""
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    arrived_cache = {}
    for kind, label, loader in COURSE_ACTIVITY_TYPES:
        for activity in loader():
            day = valid_day(activity.date)
            if not day or day > today or getattr(activity, "is_deleted", False):
                continue
            teachers = _course_activity_teacher_ids(activity)
            explicit = configured_courses.get(getattr(activity, "course_id", "")) or configured_types.get(getattr(activity, "course_type", ""))
            candidates = {explicit} if explicit else set().union(*(member_orgs[t] for t in teachers))
            # 没有明确归属且老师跨组织时，不能猜测归属或重复计课。
            if len(candidates) != 1:
                continue
            org_id = next(iter(candidates))
            if org_id not in org_names:
                continue
            participants = _course_participant_ids(kind, activity)
            if kind in {"gcs", "ers", "eks"}:
                participants.add(getattr(activity, "owner_id", ""))
            if kind == "eks":
                try:
                    owners = json.loads(getattr(activity, "description", "") or "[]")
                except (ValueError, TypeError):
                    owners = []
                if isinstance(owners, list):
                    participants.update(o.get("id", "") for o in owners if isinstance(o, dict))
            participants -= set(getattr(activity, "withdrawn_participant_ids", []) or [])
            if day not in arrived_cache:
                arrived_cache[day] = visit_service.get_arrived_customer_ids(day, day)
            participants &= set(customers) & arrived_cache[day]
            name = _course_activity_name(kind, label, activity)
            key = f"{kind}:{activity.id}"
            details = _course_owner_details(kind, activity, customers, set(customers))
            row = {
                "id": key, "date": day, "name": name, "type": label, "organization_id": org_id,
                "organization": org_names[org_id], "teachers": "、".join(filter(None, (customer_name(t) for t in sorted(teachers)))),
                "hours": _course_activity_hours(kind, activity),
                "owner": details["owner_name"], "parts": details["body_part_count"] if kind == "eks" else "",
                "participants": len(participants), "participant_ids": sorted(participants),
                "details": ["到场｜" + customer_name(cid) for cid in sorted(participants)],
            }
            courses.append(row)
            for cid in sorted(participants):
                events.append({"id": f"attendance:{key}:{cid}", "kind": "attendance", "product": kind,
                               "subtype": getattr(activity, "course_type", "") or "", "date": day,
                               "customer_id": cid, "customer": customer_name(cid), "organization_id": org_id,
                               "organization": org_names[org_id], "label": name, "course_key": key})
    if permissions["customer_access"]["transaction_access"] != "none":
        for key, label, loader, subtype_field in PRODUCTS:
            for payment in loader():
                cid, org_id = payment.customer_id, getattr(payment, "organization_id", "")
                if cid not in customers or org_id not in org_names or getattr(payment, "is_deleted", False) or getattr(payment, "voided", False):
                    continue
                day = valid_day(getattr(payment, "deal_date", ""))
                # 无成交日期的历史记录不凭录入日期猜测业务先后。
                if not day or day > today:
                    continue
                subtype = str(getattr(payment, subtype_field, "") or "") if subtype_field else ""
                if subtype == "粗门次卡":
                    continue
                closers = "、".join(str(c.get("name", "")) for c in getattr(payment, "closers", []) or []) or getattr(payment, "closer_name", "") or ""
                events.append({"id": f"purchase:{key}:{payment.id}", "kind": "purchase", "product": key,
                               "subtype": subtype, "date": day, "customer_id": cid, "customer": customer_name(cid),
                               "organization_id": org_id, "organization": org_names[org_id],
                               "label": f"{label} · {subtype}" if subtype else label, "closers": closers})
    attendance = {(e["course_key"], e["customer_id"]): e for e in events if e["kind"] == "attendance"}
    seen_usage = set()
    for deduction in project_deduction_service.list_deductions():
        if deduction.project_name != "粗门次卡" or deduction.is_deleted:
            continue
        key = f"{deduction.source_activity_type}:{deduction.source_activity_id}"
        base = attendance.get((key, deduction.customer_id))
        if not base or (key, deduction.customer_id) in seen_usage:
            continue
        seen_usage.add((key, deduction.customer_id))
        events.append({**base, "id": f"coarse:{key}:{deduction.customer_id}", "kind": "coarse_usage", "product": "coarse", "subtype": "", "label": "粗门次卡 · " + base["label"],
                       "settlement_id": deduction.organization_id if deduction.organization_id in org_names else "",
                       "settlement": org_names.get(deduction.organization_id, "无权查看或未配置"),
                       "deal_date": valid_day(deduction.deduction_date), "count": deduction.count,
                       "closers": "、".join(str(c.get("name", "")) for c in deduction.closers or []) or deduction.closer_name or ""})
    return organizations, permissions, events, courses


def analyze(request, query: PrincipalQuery, *, export=False):
    organizations, permissions, events, courses = collect_data(request)
    chosen = selected_orgs(organizations, query.organization_id)
    access = permissions["customer_access"]["transaction_access"]
    if query.tab in {"orders", "conversion"}:
        customer_access_service.require_transaction_access(request, detail=True)
    start = query.date_from.isoformat() if query.date_from else "0001-01-01"
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    end = min(query.date_to or today, today).isoformat()
    purchases = sorted((e for e in events if e["kind"] == "purchase"), key=lambda e: (e["date"], e["id"]))
    first_product, first_person = {}, {}
    for event in purchases:
        first_product.setdefault((event["customer_id"], event["product"]), event["date"])
        first_person.setdefault(event["customer_id"], event["date"])
        event["order_kind"] = "repeat" if event["date"] > first_product[(event["customer_id"], event["product"])] else "cross" if event["date"] > first_person[event["customer_id"]] else "first"
        event["classification"] = {"repeat": "同类复购", "cross": "跨品类首购", "first": "首购"}[event["order_kind"]]
        event["details"] = [f'成交｜{event["date"]}｜{event["label"]}｜{event["organization"]}', "成交人｜" + (event["closers"] or "—")]
    ranged_orders = [e for e in purchases if e["organization_id"] in chosen and start <= e["date"] <= end and (not query.product or e["product"] == query.product)]
    selected_courses = [c for c in courses if c["organization_id"] in chosen and start <= c["date"] <= end]
    first_arrival = {}
    for event in sorted((e for e in events if e["kind"] == "attendance"), key=lambda e: e["date"]):
        first_arrival.setdefault(event["customer_id"], event["date"])
    for course in selected_courses:
        ids = set(course["participant_ids"])
        course["new_count"] = sum(first_arrival.get(cid) == course["date"] for cid in ids)
        course["old_count"] = len(ids) - course["new_count"]
        # 课程后的关联购买仅做关联展示，不能声明某节课促成该订单。
        following = [p for p in purchases if p["customer_id"] in ids and p["organization_id"] == course["organization_id"] and course["date"] <= p["date"] <= (date.fromisoformat(course["date"]) + timedelta(days=query.rule.window_days)).isoformat()]
        course["order_count"] = len(following) if access == "detail" else "—"
        if access == "detail":
            course["details"] += [f'后续交易（关联非归因）｜{p["customer"]}｜{p["date"]}｜{p["label"]}｜{p["organization"]}' for p in following]
    summary = {"课程节数": len(selected_courses), "课时数": sum(c["hours"] for c in selected_courses),
               "到场人数": len({cid for c in selected_courses for cid in c["participant_ids"]}),
               "到场人次": sum(c["participants"] for c in selected_courses)}
    if access != "none":
        buyers = {e["customer_id"] for e in ranged_orders}
        repeat_buyers = {e["customer_id"] for e in ranged_orders if e["order_kind"] == "repeat"}
        summary.update({"交易笔数": len(ranged_orders), "成交人数": len(buyers),
                        "首购人数": len({e["customer_id"] for e in ranged_orders if e["order_kind"] == "first"}),
                        "同类复购人数": len(repeat_buyers),
                        "同类复购人数占比": f"{len(repeat_buyers) / len(buyers) * 100:.1f}%" if buyers else "—"})
    if query.tab == "conversion":
        result = calculate_conversion(events, query.rule, chosen, start, end)
        summary = result["summary"]
        rows = [r for r in result["items"] if not query.status or r["status"] == query.status]
        columns = [("customer", "客户"), ("date", "起点日期"), ("organization", "起点组织"), ("source", "起点"), ("deadline", "观察截止"), ("status_label", "状态"), ("target_count", "匹配目标数"), ("same_day", "说明")]
    elif query.tab == "orders":
        rows = [r for r in ranged_orders if not query.order_filter or r["order_kind"] == query.order_filter]
        if not query.order_filter and query.product in {"", "coarse"}:
            for usage in events:
                if usage["kind"] != "coarse_usage" or usage.get("settlement_id") not in chosen or not start <= usage.get("deal_date", "") <= end:
                    continue
                rows.append({**usage, "date": usage["deal_date"], "organization": usage["settlement"], "classification": "扣卡使用（不计购买）",
                             "details": [f'课程日期｜{usage["date"]}｜课程所属｜{usage["organization"]}', f'扣卡｜{usage["count"]}次｜成交归属｜{usage["settlement"]}']})
        columns = [("date", "成交日期"), ("customer", "客户"), ("label", "项目"), ("organization", "成交归属"), ("classification", "购买类型"), ("closers", "成交人")]
    else:
        rows = selected_courses
        columns = [("date", "课程日期"), ("name", "课程"), ("type", "活动类型"), ("organization", "课程所属"), ("teachers", "课程老师"), ("hours", "课时数"), ("owner", "案主"), ("parts", "部位数"), ("participants", "到场人数"), ("new_count", "首次到场"), ("old_count", "再次到场"), ("order_count", "后续交易笔数")]
    rows = sorted(rows, key=lambda r: (r["date"], r["id"]), reverse=True)
    total = len(rows)
    page = min(query.page, max(1, (total + query.page_size - 1) // query.page_size))
    # 内部关联字段不出 API；金额、支付方式以及客户隐私字段从未加入输出。
    safe_rows = [{key: row.get(key, "") for key in ["id", "details", *[c[0] for c in columns]]} for row in rows]
    return {"summary": summary, "columns": [{"key": k, "label": label} for k, label in columns],
            "items": safe_rows if export else safe_rows[(page - 1) * query.page_size:page * query.page_size],
            "total": total, "page": page, "page_size": query.page_size, "total_pages": max(1, (total + query.page_size - 1) // query.page_size),
            "notice": "统计限可见组织与客户。首购/首次到场按可见历史判断，同日多单不推断先后；课时沿用课程扣卡课时口径。无成交日期、归属缺失或歧义的记录不参与计算。后续交易为关联，非因果归因。"}
