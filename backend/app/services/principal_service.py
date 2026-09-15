"""主理人组织经营数据。所有分析先裁剪组织与客户范围，再进行关联。"""

import json
import locale
from collections import Counter, defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.models.principal import PrincipalQuery
from app.services import (
    account_service,
    course_service,
    course_type_service,
    customer_access_service,
    customer_service,
    customer_tag_service,
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
    upsell_config_service,
    visit_service,
)
from app.services.principal_conversion_service import calculate_conversion
from app.utils.request_roles import get_request_roles

# 中文按拼音排序：和前端 localeCompare("zh-CN") 的口径一致；系统没有中文排序规则时退回码点排序
try:
    locale.setlocale(locale.LC_COLLATE, "zh_CN.UTF-8")
except locale.Error:  # pragma: no cover - 取决于运行环境
    pass


def _collate(text: str) -> str:
    try:
        return locale.strxfrm(text)
    except (ValueError, TypeError):  # pragma: no cover
        return text

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
        # 整体数据查阅人默认属于每个组织，所以这里仍只按成员关系收窄，不额外放宽权限配置。
        organizations = [
            o for o in organizations if member_id and organization_service.is_member(o, member_id)
        ]
    # 主理人页不受账号「客户资料可见范围」限制，只受页面内筛选（组织、日期、活动类型等）限制。
    return organizations, {c.id: c for c in customers}, permissions


def require_participant_profile_access(request, customer_id: str, course_id: str = ""):
    """只授予组织课程参与者的资料读取入口，不改变通用客户范围或写权限。"""
    from app.middleware.jwt_auth import require_page_permission

    require_page_permission("principal")(request)
    # 超管、以及客户数据范围本来就是「全部」的角色，本来就能看所有客户，
    # 不该被参与者这条特批校验挡住（小程序里点课程参与人的「资料」报没权限就是这种情况）。
    roles = get_request_roles(request)
    if "超级管理员" in roles or customer_access_service.get_customer_permissions(roles).get("scope") == "all":
        return False
    organizations, _, _, courses = collect_data(request)
    matched = [course for course in courses if customer_id in course["participant_ids"] and (not course_id or course["id"] == course_id)]
    if not matched:
        raise HTTPException(403, "没有查看该客户的权限")
    _, customers, _ = scope(request)
    rows = course_participant_rows(matched, organizations, customers=customers)
    # 旧端未传课程时保守按外部处理，不借用另一门课的内部身份。
    return not course_id or any(row["customer_id"] == customer_id and row["participant_category"] == "外部人员" for row in rows)


def selected_orgs(organizations, requested: str) -> set[str]:
    allowed = {o.id for o in organizations}
    if requested and requested not in allowed:
        raise HTTPException(403, "无权查看该组织的主理人数据")
    return {requested} if requested else allowed


def conversion_customer_rows(request, rule, events) -> dict[str, dict]:
    """转化规则里真的加了条件时，才建客户档案表（口径与自定义筛选一致）。"""
    if not any(action.conditions for action in [rule.source, *rule.targets]):
        return {}
    from app.services import custom_analysis_service

    rows = custom_analysis_service.build_customer_dataset(
        getattr(request.state, "user_id", ""),
        allowed_customer_ids={event["customer_id"] for event in events},
    )
    return {row["id"]: row for row in rows}


def valid_day(value) -> str:
    try:
        return date.fromisoformat(str(value or "")[:10]).isoformat()
    except ValueError:
        return ""


def collect_data(request, *, metadata_only=False):
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
    arrived_cache = defaultdict(set)
    for visit in visit_service._visits.values():
        if visit.arrived and not visit.is_deleted:
            arrived_cache[visit.visit_date].add(visit.customer_id)
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
            # 案主不算到场：觉醒游戏/情绪释放/能量结的案主单独出「案主」列
            participants.discard(getattr(activity, "owner_id", ""))
            if kind == "eks":
                try:
                    owners = json.loads(getattr(activity, "description", "") or "[]")
                except (ValueError, TypeError):
                    owners = []
                if isinstance(owners, list):
                    # 能量结的案主（可能多个）同样不算到场人数、不进新人/老人名单
                    participants -= {o.get("id", "") for o in owners if isinstance(o, dict)}
            participants -= set(getattr(activity, "withdrawn_participant_ids", []) or [])
            participants &= set(customers) & arrived_cache[day]
            name = _course_activity_name(kind, label, activity)
            key = f"{kind}:{activity.id}"
            if not metadata_only:
                details = _course_owner_details(kind, activity, customers, set(customers))
                row = {
                    "id": key, "date": day, "name": name, "type": label, "organization_id": org_id,
                    "organization": org_names[org_id], "teachers": "、".join(filter(None, (customer_name(t) for t in sorted(teachers)))),
                    "hours": _course_activity_hours(kind, activity),
                    "owner": details["owner_name"], "parts": details["body_part_count"] if kind == "eks" else "",
                    "participants": len(participants), "participant_ids": sorted(participants),
                    "participant_names": [(cid, customer_name(cid)) for cid in sorted(participants)],
                    "activity_type": kind,
                    "course_subtype": getattr(activity, "course_type", "") or "",
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
    if metadata_only:
        return organizations, permissions, events, courses
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


# 经营概况展开面板里的二级勾选：同一行单选（前端保证），跨行取交集；引流人只在客户列表上用，进口不到这里
BREAKDOWN_PICKS = {"deals": ("product", 6), "subtype": ("subtype", 8), "buy": ("classification", 4),
                   "type": ("type", 5), "course": ("name", 7), "teacher": ("teachers", 8)}


def _course_bucket():
    """课程二级项上要带的汇总：上课人数（去重）、上课人次、课程当日成交、课程关联成交。"""
    return {"people": set(), "visits": 0, "same_day": 0, "related": 0}


def _collect_course(bucket, course):
    bucket["people"].update(course["participant_ids"])
    bucket["visits"] += course["participants"]
    bucket["same_day"] += course.get("same_day_deals", 0)
    bucket["related"] += course.get("related_deals", 0)


def _course_stats(bucket):
    return {"people": len(bucket["people"]), "visits": bucket["visits"],
            "same_day": bucket["same_day"], "related": bucket["related"]}


def _ordered_subtypes(product_key, counter):
    """会员卡的卡种按付款页里的顺序排（次卡 → 体验会员 → 月卡 → …），其他项目按数量排。"""
    items = counter.most_common()
    if product_key != "membership":
        return items
    order = membership_card_service.MEMBERSHIP_CARD_TYPE_ORDER
    rank = {name: index for index, name in enumerate(order)}
    return sorted(items, key=lambda pair: rank.get(pair[0], len(order)))


def _course_key(row) -> str:
    """具体课程按「课程名 + 所属组织」区分：同名课程在不同组织各算一项。"""
    return f'{row.get("name") or ""}｜{row.get("organization") or ""}'


# 引流客户列表里的敏感字段：键名和 customer_access 的 sensitive_fields 一致，
# 没有权限的角色不下发这些字段，前端也就不会出现在「列表设置」里
PROFILE_FIELD_KEYS = ("visit_purpose", "trauma_history", "current_block", "work_info", "other_info")


def _profile_field_values(customer, allowed: list[str]) -> dict:
    """到访目的 / 创伤经历 / 当下卡点 / 工作情况 / 其他信息（口径与客户详情一致）。"""
    if not allowed:
        return {}
    work_status = (getattr(customer, "work_status", "") or "").strip()
    work_description = (getattr(customer, "work_description", "") or "").strip()
    values = {
        "visit_purpose": (getattr(customer, "tags", "") or "").strip(),
        "trauma_history": (getattr(customer, "basic_info", "") or "").strip(),
        "current_block": ((getattr(customer, "assessment", "") or "").strip()
                          or (getattr(customer, "core_situation", "") or "").strip()),
        "work_info": f"{work_status} · {work_description}" if work_status and work_description else (work_status or work_description),
        "other_info": (getattr(customer, "other_info", "") or "").strip(),
    }
    return {key: values.get(key, "") for key in allowed}


def _sort_key(row, field):
    """按某一列排序整批数据：数字按大小排（0 不能当成空值），文本按拼音排。"""
    raw = row.get(field, "")
    text = "" if raw is None else str(raw).strip()
    try:
        return (0, float(text), "")
    except ValueError:
        # 中文按拼音（和前端 localeCompare('zh-CN') 一致）；取不到中文排序规则就退回码点排序
        return (1, 0.0, _collate(text))


def apply_breakdown_picks(rows, picks):
    chosen = defaultdict(set)
    for pick in picks or []:
        for prefix, (field, offset) in BREAKDOWN_PICKS.items():
            if pick.startswith(prefix + ":"):
                chosen[field].add(pick[offset:])
                break
    for field, values in chosen.items():
        if not values:
            continue
        if field == "teachers":
            rows = [row for row in rows if values & set(str(row.get("teachers") or "").split("、"))]
        elif field == "name":
            # 具体课程按「课程名 + 组织」筛，同名课程在不同组织互不影响
            rows = [row for row in rows if _course_key(row) in values]
        else:
            rows = [row for row in rows if str(row.get(field) or "") in values]
    return rows


def merge_orders_by_customer(rows):
    """同一人显示一次：一个客户一行，日期取最近一笔，项目/归属/购买类型/成交人合并去重。"""
    grouped = {}
    for row in rows:
        key = row.get("customer_id") or row.get("customer") or row.get("id")
        entry = grouped.get(key)
        if entry is None:
            entry = grouped[key] = {
                "id": f"customer:{key}", "customer_id": row.get("customer_id", ""),
                "customer": row.get("customer", ""), "date": row.get("date", ""),
                "deal_count": row.get("deal_count", 0),
                "labels": [], "organizations": [], "classifications": [], "closers": [],
            }
        entry["date"] = max(entry["date"], row.get("date", ""))
        for field, bucket in (("label", "labels"), ("organization", "organizations"),
                              ("classification", "classifications"), ("closers", "closers")):
            for value in str(row.get(field) or "").split("、"):
                if value and value not in entry[bucket]:
                    entry[bucket].append(value)
    merged = []
    for entry in grouped.values():
        labels = entry.pop("labels")
        entry["label"] = labels[0] + f" 等 {len(labels)} 项" if len(labels) > 1 else (labels[0] if labels else "")
        entry["organization"] = "、".join(entry.pop("organizations"))
        entry["classification"] = "、".join(entry.pop("classifications"))
        entry["closers"] = "、".join(entry.pop("closers"))
        merged.append(entry)
    return merged


def org_referrer_names(org, customers) -> set[str]:
    """该组织/俱乐部算作引流人的人员名字集合（与「引流人数」同一口径）。"""
    mode = getattr(org, "referrer_mode", "member")
    if mode == "all":
        return {(c.nickname or c.name) for c in customers.values() if (c.nickname or c.name)}
    ids = set(getattr(org, "referrer_ids" if mode == "selected" else "member_ids", []) or [])
    return {
        (customers[cid].nickname or customers[cid].name)
        for cid in ids
        if cid in customers and (customers[cid].nickname or customers[cid].name)
    }


def course_participant_rows(courses, organizations, participant_scope="", customers=None, history=None):
    """每人每课一行；被课程所属组织/俱乐部的引流人引流来的客户算内部。

    history＝{(组织id, 客户id): [次数, 课时]}：该客户在这个组织/俱乐部的累计参与（不受统计周期限制）。
    """
    orgs = {org.id: org for org in organizations}
    people = customers or {}
    totals = history or {}
    rows = []
    for course in courses:
        org = orgs.get(course["organization_id"])
        if org is None:
            continue
        referrer_names = org_referrer_names(org, people)
        names = dict(course.get("participant_names") or [])
        for cid in course.get("participant_ids") or []:
            customer = people.get(cid)
            referrer = (getattr(customer, "referrer", "") or "").strip() if customer else ""
            category = "internal" if referrer and referrer in referrer_names else "external"
            if participant_scope and category != participant_scope:
                continue
            label = "内部人员" if category == "internal" else "外部人员"
            total_count, total_hours = totals.get((course["organization_id"], cid), (0, 0))
            rows.append({
                "id": f'{course["id"]}:participant:{cid}', "customer_id": cid, "course_id": course["id"],
                "customer": names.get(cid) or "未命名", "participant_category": label,
                "org_participation_count": total_count, "org_participation_hours": round(float(total_hours), 1),
                **{key: course.get(key, "") for key in ("date", "name", "type", "organization", "teachers", "hours")},
                "details": [f'课程｜{course["name"]}', f'课程所属｜{course["organization"]}', f'人员类型｜{label}'],
            })
    return rows


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
    repeat_times = defaultdict(int)
    # 升单配置：按大类的先后顺序判断这笔是不是升单（大类里可以只挑某个卡种）
    upsell_levels = upsell_config_service.level_order()
    # 粗门次卡扣卡本质也是一次购买，和会员卡等其他类型排在同一条时间线上（首购/复购/升单都算它）
    coarse_usages = [e for e in events if e["kind"] == "coarse_usage"]
    order_timeline = sorted([*purchases, *coarse_usages], key=lambda e: (e["date"], e["id"]))
    earliest_by_product = {}
    earliest_by_subtype = {}
    for event in order_timeline:
        earliest_by_product.setdefault((event["customer_id"], event["product"]), event["date"])
        earliest_by_subtype.setdefault((event["customer_id"], event["product"], event.get("subtype") or ""), event["date"])

    def level_of(product: str, subtype: str):
        for position, items in enumerate(upsell_levels):
            if any(item_product == product and (not item_subtype or item_subtype == subtype) for item_product, item_subtype in items):
                return position, items
        return None, None

    def bought_before(customer_id: str, items, date_value: str) -> bool:
        for item_product, item_subtype in items:
            if item_subtype:
                if earliest_by_subtype.get((customer_id, item_product, item_subtype), "") and earliest_by_subtype[(customer_id, item_product, item_subtype)] < date_value:
                    return True
            elif earliest_by_product.get((customer_id, item_product), "") and earliest_by_product[(customer_id, item_product)] < date_value:
                return True
        return False

    # 每个客户第一次进某一档的日期，用来保证「进档」只算一次
    earliest_in_level = {}
    for event in order_timeline:
        position, _ = level_of(event["product"], event.get("subtype") or "")
        if position is not None:
            earliest_in_level.setdefault((event["customer_id"], position), event["date"])
    for event in order_timeline:
        # 同类＝同一个大类 + 同一个卡种/具体项目：会员卡里换了卡种就不算复购（算跨品类首购）
        first_product.setdefault((event["customer_id"], event["product"], event.get("subtype") or ""), event["date"])
        first_person.setdefault(event["customer_id"], event["date"])
        event["order_kind"] = "repeat" if event["date"] > first_product[(event["customer_id"], event["product"], event.get("subtype") or "")] else "cross" if event["date"] > first_person[event["customer_id"]] else "first"
        event["classification"] = {"repeat": "同类复购", "cross": "跨品类首购", "first": "首购"}[event["order_kind"]]
        # 这是同类（同大类 + 同卡种）里的第几次购买，复购时用来显示次数
        repeat_times[(event["customer_id"], event["product"], event.get("subtype") or "")] += 1
        event["repeat_times"] = repeat_times[(event["customer_id"], event["product"], event.get("subtype") or "")]
        # 升单：买过更靠前的大类之后，第一次买这一档大类里的项目
        event["is_upsell"] = False
        position, _items = level_of(event["product"], event.get("subtype") or "")
        if position:
            earlier_items = [item for level in upsell_levels[:position] for item in level]
            first_in_level = earliest_in_level.get((event["customer_id"], position)) == event["date"]
            if first_in_level and bought_before(event["customer_id"], earlier_items, event["date"]):
                event["is_upsell"] = True
                event["classification"] = "升单"
        if event["kind"] == "purchase":
            event["details"] = [f'成交｜{event["date"]}｜{event["label"]}｜{event["organization"]}', "成交人｜" + (event["closers"] or "—")]
        else:
            event["details"] = [f'课程日期｜{event["date"]}｜课程所属｜{event["organization"]}', f'扣卡｜{event["count"]}次｜成交归属｜{event["settlement"]}']
    ranged_orders = [e for e in purchases if e["organization_id"] in chosen and start <= e["date"] <= end and (not query.product or e["product"] == query.product)]
    # 粗门次卡扣卡按购买算：它也在成交口径里（成交量、成交人数、付费项目拆分都要算上）
    ranged_usages = [u for u in coarse_usages
                     if u.get("settlement_id") in chosen and start <= u.get("deal_date", "") <= end
                     and query.product in {"", "coarse"}]
    ranged_all = [*ranged_orders, *ranged_usages]
    selected_courses = [c for c in courses if c["organization_id"] in chosen and start <= c["date"] <= end]
    if query.activity_type:
        selected_courses = [c for c in selected_courses if c.get("activity_type") == query.activity_type]
    if query.course_subtype:
        selected_courses = [c for c in selected_courses if c.get("course_subtype") == query.course_subtype]
    first_arrival = {}
    for event in sorted((e for e in events if e["kind"] == "attendance"), key=lambda e: e["date"]):
        first_arrival.setdefault(event["customer_id"], event["date"])
    # 课程强关联成交：明确挂在这门课上的成交（比如粗门次卡扣卡时要选课程）
    course_related = defaultdict(list)
    for usage in coarse_usages:
        if usage.get("course_key"):
            course_related[usage["course_key"]].append(usage)
    purchases_by_day_org = defaultdict(list)
    for purchase in purchases:
        purchases_by_day_org[(purchase["date"], purchase["organization_id"])].append(purchase)
    for course in selected_courses:
        ids = set(course["participant_ids"])
        # 明细里先放一条课程本身，保证点任何一个数字都能看到这门课的信息
        course["details"] = [f'课程｜{course["name"]}｜{course["date"]}｜{course["organization"]}'] + list(course.get("details") or [])
        if course.get("activity_type") == "eks" and course.get("parts"):
            # 能量结只结算部位数，没有课时；这里把部位数和案主写清楚
            course["details"].append(f'部位数｜{course["parts"]} 处｜案主｜{course["owner"] or "—"}')
        course["new_count"] = sum(first_arrival.get(cid) == course["date"] for cid in ids)
        course["old_count"] = len(ids) - course["new_count"]
        # 新人/老人名单：与课程记录页一致，按可见课程历史的首次到场日划分
        new_names = [name for cid, name in course.get("participant_names") or [] if first_arrival.get(cid) == course["date"]]
        old_names = [name for cid, name in course.get("participant_names") or [] if first_arrival.get(cid) != course["date"]]
        # 名单里的名字要能点开客户详情，所以额外给出 id
        course["new_people"] = [{"id": cid, "name": name} for cid, name in course.get("participant_names") or []
                                if first_arrival.get(cid) == course["date"] and name]
        course["old_people"] = [{"id": cid, "name": name} for cid, name in course.get("participant_names") or []
                                if first_arrival.get(cid) != course["date"] and name]
        course["new_names"] = "、".join(n for n in new_names if n)
        course["old_names"] = "、".join(n for n in old_names if n)
        # 关联成交只算强关联：明确选了这门课的成交（不把到场客户以后的任意成交算进来，避免误导）
        related = course_related.get(course["id"], [])
        course["order_count"] = len(related) if access == "detail" else "—"
        course["related_deals"] = len(related)
        # 课程当天的成交＝这门课的到场客户当天成交了多少笔（同组织）
        following = [p for p in purchases_by_day_org[(course["date"], course["organization_id"])] if p["customer_id"] in ids]
        course["same_day_deals"] = sum(1 for p in following if p["date"] == course["date"])
        if access == "detail":
            course["details"] += [f'关联成交｜{p["customer"]}｜{p["deal_date"]}｜{p["label"]}｜{p["settlement"]}' for p in related]
            course["details"] += [f'当日成交｜{p["customer"]}｜{p["date"]}｜{p["label"]}｜{p["organization"]}'
                                  for p in following if p["date"] == course["date"]]
    summary = {"课程数": len(selected_courses), "课时数": sum(c["hours"] for c in selected_courses),
               "到场人数": len({cid for c in selected_courses for cid in c["participant_ids"]}),
               "到场人次": sum(c["participants"] for c in selected_courses)}
    # 上课人数 / 上课人次再拆内部、外部：内部＝被课程所属组织/俱乐部的引流人引流来的客户
    if selected_courses:
        course_people = {c.id: c for c in customer_service.list_customers()}
        internal_orgs = {org.id: org_referrer_names(org, course_people) for org in organizations}
        internal_ids, external_ids = set(), set()
        internal_times = external_times = 0
        for course in selected_courses:
            referrer_names = internal_orgs.get(course["organization_id"], set())
            for cid in course["participant_ids"]:
                person = course_people.get(cid)
                referrer = (getattr(person, "referrer", "") or "").strip() if person else ""
                if referrer and referrer in referrer_names:
                    internal_ids.add(cid)
                    internal_times += 1
                else:
                    external_ids.add(cid)
                    external_times += 1
        # 同一个人在不同课程里的归属可能不同：只要在某门课里算内部，人数就按内部计，保证内部+外部＝总人数
        external_ids -= internal_ids
        summary.update({
            "上课人数（内部）": len(internal_ids), "上课人数（外部）": len(external_ids),
            "上课人次（内部）": internal_times, "上课人次（外部）": external_times,
        })
    if access != "none":
        buyers = {e["customer_id"] for e in ranged_all}
        summary.update({"交易笔数": len(ranged_all), "成交人数": len(buyers)})
    # 经营概况：二级拆分（点这些项可以筛选下面的列表）
    breakdown = {}
    if query.tab == "overview":
        # 引流人存在客户档案上，这里按可见范围取一次客户（只经营概况需要）
        _, customers, _ = scope(request)
        product_labels = {key: label for key, label, _, _ in PRODUCTS}
        # 下拉之间互相影响：每一维的选项按「其他维度」筛完再统计，自己这一维不参与，免得把自己的选项筛没
        picks = query.breakdown or []
        other_picks = lambda *exclude: [pick for pick in picks if pick.split(":", 1)[0] not in exclude]
        product_scope = apply_breakdown_picks(ranged_all, other_picks("deals", "subtype"))
        subtype_scope = apply_breakdown_picks(ranged_orders, other_picks("subtype"))
        buy_scope = apply_breakdown_picks(ranged_all, other_picks("buy"))
        type_scope = apply_breakdown_picks(selected_courses, other_picks("type", "course"))
        teacher_scope = apply_breakdown_picks(selected_courses, other_picks("teacher"))
        course_scope = apply_breakdown_picks(selected_courses, other_picks("course"))
        product_counts = Counter(e["product"] for e in product_scope)
        product_buyers = defaultdict(set)
        for order in product_scope:
            product_buyers[order["product"]].add(order["customer_id"])
        subtype_counts = defaultdict(Counter)
        subtype_buyers = defaultdict(set)
        for order in subtype_scope:
            if order.get("subtype"):
                subtype_counts[order["product"]][order["subtype"]] += 1
                subtype_buyers[(order["product"], order["subtype"])].add(order["customer_id"])
        breakdown["deals"] = [
            {"key": key, "label": label, "count": product_counts.get(key, 0),
             "buyers": len(product_buyers[key]),
             "subtypes": [{"key": name, "label": name, "count": count, "buyers": len(subtype_buyers[(key, name)])}
                          for name, count in _ordered_subtypes(key, subtype_counts[key])]}
            for key, label, _, _ in PRODUCTS if product_counts.get(key, 0)
        ]
        # 粗门次卡也要能单独筛
        if product_counts.get("coarse"):
            breakdown["deals"].append({"key": "coarse", "label": "粗门次卡", "count": product_counts["coarse"],
                                       "buyers": len(product_buyers["coarse"]), "subtypes": []})
        # 购买类型（首购/同类复购/跨品类首购/升单）：可以和付费项目叠加筛选
        buy_counts = Counter(order["classification"] for order in buy_scope)
        buy_buyers = defaultdict(set)
        for order in buy_scope:
            buy_buyers[order["classification"]].add(order["customer_id"])
        breakdown["buys"] = [{"key": name, "label": name, "count": buy_counts[name], "buyers": len(buy_buyers[name])}
                             for name in ("首购", "同类复购", "跨品类首购", "升单") if buy_counts.get(name)]
        type_counts = Counter(c["type"] for c in type_scope)
        teacher_counts = Counter(
            name for course in teacher_scope for name in str(course.get("teachers") or "").split("、") if name
        )
        hours_by_type, hours_by_teacher = Counter(), Counter()
        type_subtypes, type_subtype_hours = defaultdict(Counter), defaultdict(Counter)
        type_stats, subtype_stats, teacher_stats = defaultdict(_course_bucket), defaultdict(_course_bucket), defaultdict(_course_bucket)
        for course in type_scope:
            hours = course.get("hours") or 0
            hours_by_type[course["type"]] += hours
            _collect_course(type_stats[course["type"]], course)
        for course in course_scope:
            hours = course.get("hours") or 0
            type_subtypes[course["type"]][_course_key(course)] += 1
            type_subtype_hours[course["type"]][_course_key(course)] += hours
            _collect_course(subtype_stats[(course["type"], _course_key(course))], course)
        for course in teacher_scope:
            hours = course.get("hours") or 0
            for name in str(course.get("teachers") or "").split("、"):
                if name:
                    hours_by_teacher[name] += hours
                    _collect_course(teacher_stats[name], course)
        breakdown["courses"] = {
            # 类型下面再看每个具体课程（课程名）开了多少场，和付费项目→卡种是同一层的用法
            "by_type": [{"key": name, "label": name, "count": count, "hours": hours_by_type[name],
                         **_course_stats(type_stats[name]),
                         # 同名课程按组织分开显示：读书会 · 无忧茶院 / 读书会 · 要脸俱乐部
                         "subtypes": [{"key": course_key, "label": course_key.replace("｜", " · "), "count": num,
                                       "hours": type_subtype_hours[name][course_key],
                                       **_course_stats(subtype_stats[(name, course_key)])}
                                      for course_key, num in type_subtypes[name].most_common()]}
                        for name, count in type_counts.most_common()],
            "by_teacher": [{"key": name, "label": name, "count": count, "hours": hours_by_teacher[name],
                            **_course_stats(teacher_stats[name])} for name, count in teacher_counts.most_common()],
        }
        # 引流人数：按组织的引流归属配置算——member＝组织成员（默认），all＝所有人，selected＝指定人员
        # 组织成员 / 指定引流人可能不在当前账号的客户可见范围内（例如本人看不到自己这条客户记录），
        # 名字统一用完整客户表解析；具体某个客户是否计入仍按可见范围。
        referral_directory = {
            customer.id: customer for customer in customer_service.list_customers()
        }

        def referrer_name(customer_id: str) -> str:
            customer = referral_directory.get(customer_id)
            return (customer.nickname or customer.name or "").strip() if customer else ""

        member_names: set[str] = set()
        for org in organizations:
            if org.id not in chosen:
                continue
            mode = getattr(org, "referrer_mode", "member")
            if mode == "all":
                member_names |= {
                    (customer.nickname or customer.name)
                    for customer in customers.values()
                    if customer.nickname or customer.name
                }
                continue
            customer_ids = set(org.referrer_ids or []) if mode == "selected" else set(org.member_ids or [])
            member_names |= {name for cid in customer_ids if (name := referrer_name(cid))}
        customer_products = defaultdict(Counter)
        # 会员卡还要能往下看卡种：按 (大类, 卡种) 再记一份
        customer_subtypes = defaultdict(Counter)
        for order in ranged_all:
            customer_products[order["customer_id"]][order["product"]] += 1
            if order["product"] == "membership" and order.get("subtype"):
                customer_subtypes[order["customer_id"]][order["subtype"]] += 1
        # 引流客户还能按跟进阶段 / 流量来源 / 客户标签继续筛，这里把这三个字段一起带上
        visible_tags = customer_tag_service.visible_tags_by_customer(getattr(request.state, "user_id", ""))
        # 到访目的 / 创伤经历 / 当下卡点 / 工作情况 / 其他信息：没有权限的角色连字段都不下发
        sensitive_fields = customer_access_service.get_customer_permissions(
            get_request_roles(request)
        )["sensitive_fields"]
        allowed_profile_fields = [key for key in PROFILE_FIELD_KEYS if sensitive_fields.get(key)]
        # 未填引流人的客户统一归到「未配置」，避免总数对不上客户资料
        UNASSIGNED_REFERRER = "未配置"
        include_unassigned = any(
            getattr(org, "include_unassigned_referrers", True)
            for org in organizations if org.id in chosen
        )
        referrer_products = defaultdict(Counter)
        referred = defaultdict(list)
        for customer in customers.values():
            referrer = (getattr(customer, "referrer", "") or "").strip()
            if not referrer:
                if not include_unassigned:
                    continue
                referrer = UNASSIGNED_REFERRER
            elif referrer not in member_names:
                continue
            # 引流人数按「引流时间」落在统计周期内才计入；未限定日期时全量纳入
            referral_day = valid_day(getattr(customer, "referral_date", ""))
            if referral_day:
                if not (start <= referral_day <= end):
                    continue
            elif query.date_from or query.date_to:
                continue
            counts = customer_products.get(customer.id, Counter())
            subtypes = customer_subtypes.get(customer.id, Counter())
            referrer_products[referrer].update(counts)
            referred[referrer].append({
                "id": customer.id,
                "name": customer.nickname or customer.name or "未命名",
                "referral_date": valid_day(getattr(customer, "referral_date", "")),
                "deals": sum(counts.values()),
                "products": [{"key": key, "label": product_labels[key], "count": counts[key]}
                             for key, _ in counts.most_common() if key in product_labels],
                # 会员卡卡种成交（其他付费项目没有子类）
                "subtypes": [{"key": key, "label": key, "count": count} for key, count in subtypes.most_common()],
                # 未配置的归到「未配置」，筛选与人数都可见
                "identity": (getattr(customer, "member_type", "") or "").strip() or "未配置",
                "follow_up_status": (getattr(customer, "follow_up_status", "") or "").strip() or "未配置",
                "traffic_source": (getattr(customer, "traffic_source", "") or "").strip() or "未配置",
                "tags": [tag.get("name", "") for tag in visible_tags.get(customer.id, []) if tag.get("name")],
                "referrer_handler": (getattr(customer, "referrer_handler", "") or "").strip(),
                **_profile_field_values(customer, allowed_profile_fields),
            })
        traffic_entries = [
            {**item, "referrer": referrer}
            for referrer, items in referred.items() for item in items
        ]
        # 引流客户的邀约 / 取消邀约 / 到店 / 平均到店间隔：按统计区间，口径与客户详情一致
        referred_ids = {entry["id"] for entry in traffic_entries if entry.get("id")}
        visit_stats: dict[str, dict[str, int]] = {}
        first_arrival: dict[str, str] = {}
        for visit in visit_service.list_basic_visits(referred_ids):
            day = valid_day(getattr(visit, "visit_date", ""))
            if not day or day < start or day > end:
                continue
            bucket = visit_stats.setdefault(
                visit.customer_id, {"invite": 0, "cancel": 0, "arrive": 0}
            )
            if getattr(visit, "cancelled", False):
                bucket["cancel"] += 1
            else:
                bucket["invite"] += 1
            if getattr(visit, "arrived", False):
                bucket["arrive"] += 1
                current_first = first_arrival.get(visit.customer_id)
                if current_first is None or day < current_first:
                    first_arrival[visit.customer_id] = day
        # 参与活动：该客户在统计区间内到场参与的课程/活动场次
        activity_counts = Counter(
            event["customer_id"]
            for event in events
            if event.get("kind") == "attendance" and start <= event.get("date", "") <= end
        )
        today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
        for entry in traffic_entries:
            customer_id = entry.get("id", "")
            bucket = visit_stats.get(customer_id, {})
            entry["invite_count"] = bucket.get("invite", 0)
            entry["cancel_count"] = bucket.get("cancel", 0)
            entry["arrive_count"] = bucket.get("arrive", 0)
            entry["activity_count"] = activity_counts.get(customer_id, 0)
            arrive_count = bucket.get("arrive", 0)
            first = first_arrival.get(customer_id)
            entry["visit_interval"] = (
                f"{round((today - date.fromisoformat(first)).days / arrive_count)}天"
                if first and arrive_count else "-"
            )

        def matched(entry, exclude_prefix: str) -> bool:
            for pick in picks:
                prefix, _, value = pick.partition(":")
                if prefix == exclude_prefix or prefix not in ("traffic", "stage", "source", "tag", "identity"):
                    continue
                if prefix == "traffic" and entry["referrer"] != value:
                    return False
                if prefix == "stage" and entry["follow_up_status"] != value:
                    return False
                if prefix == "source" and entry["traffic_source"] != value:
                    return False
                if prefix == "tag" and value not in entry["tags"]:
                    return False
                if prefix == "identity" and (entry["identity"] or "") != value:
                    return False
            return True

        def traffic_facet(prefix: str, values_of) -> list[dict]:
            counter = Counter()
            for entry in traffic_entries:
                if matched(entry, prefix):
                    for value in values_of(entry):
                        counter[value] += 1
            return [{"key": name, "label": name, "count": count} for name, count in counter.most_common()]

        # 下拉选项之间互相影响：统计某一维时，用「其他维」筛过的客户来算
        traffic_by_referrer = defaultdict(list)
        for entry in traffic_entries:
            if matched(entry, "traffic"):
                traffic_by_referrer[entry["referrer"]].append(entry)
        breakdown["traffic"] = [
            {"key": name, "label": name, "count": len(traffic_by_referrer.get(name, [])),
             "deal_count": sum(item["deals"] for item in traffic_by_referrer[name]),
             "customers": traffic_by_referrer[name],
             "products": [{"key": key, "label": product_labels[key], "count": num}
                          for key, num in referrer_products[name].most_common() if key in product_labels]}
            for name, _items in sorted(referred.items(), key=lambda pair: (-len(traffic_by_referrer.get(pair[0], [])), pair[0]))
            if traffic_by_referrer.get(name)
        ]
        breakdown["traffic_filters"] = {
            "stage": traffic_facet("stage", lambda entry: [entry["follow_up_status"]] if entry["follow_up_status"] else []),
            "source": traffic_facet("source", lambda entry: [entry["traffic_source"]] if entry["traffic_source"] else []),
            "tag": traffic_facet("tag", lambda entry: entry["tags"]),
            # 会员身份人数：跟着当前所有筛选走（它本身不是筛选项，只是给人看结构）
            "identity": traffic_facet("identity", lambda entry: [entry["identity"]] if entry["identity"] else []),
        }
        # 前端「列表设置」按这个决定哪些敏感列可以出现
        breakdown["traffic_profile_fields"] = allowed_profile_fields
        summary["引流人数"] = sum(len(items) for items in referred.values())
        summary["课程当日成交数"] = sum(c.get("same_day_deals", 0) for c in selected_courses)
        summary["课程关联成交数"] = sum(c.get("related_deals", 0) for c in selected_courses)
    if query.tab == "conversion":
        result = calculate_conversion(events, query.rule, chosen, start, end,
                                      customer_rows=conversion_customer_rows(request, query.rule, events))
        summary = result["summary"]
        rows = [r for r in result["items"] if not query.status or r["status"] == query.status]
        columns = [("customer", "客户"), ("date", "起点日期"), ("organization", "起点组织"), ("source", "起点"), ("deadline", "观察截止"), ("status_label", "状态"), ("target_count", "匹配目标数"), ("same_day", "说明")]
    elif query.tab == "orders":
        rows = [r for r in ranged_orders if not query.order_filter or r["order_kind"] == query.order_filter]
        if not query.order_filter and query.product in {"", "coarse"}:
            for usage in events:
                if usage["kind"] != "coarse_usage" or usage.get("settlement_id") not in chosen or not start <= usage.get("deal_date", "") <= end:
                    continue
                rows.append({**usage, "date": usage["deal_date"], "organization": usage["settlement"],
                             "classification": usage["classification"], "details": usage["details"]})
        columns = [("date", "成交日期"), ("customer", "客户"), ("label", "项目"), ("organization", "成交归属"), ("classification", "购买类型"), ("deal_count", "成交笔数"), ("closers", "成交人")]
    else:
        rows = selected_courses
        if query.course_deal == "same_day":
            rows = [row for row in rows if (row.get("same_day_deals") or 0) > 0]
        elif query.course_deal == "related":
            rows = [row for row in rows if (row.get("related_deals") or 0) > 0]
        # 新人/老人名单放在最右侧，方便一眼看完课程本身的数据
        columns = [("date", "课程日期"), ("name", "课程"), ("type", "活动类型"), ("teachers", "课程老师"), ("owner", "案主"),
                   ("hours", "课时数"), ("participants", "到场人数"), ("same_day_deals", "课程当日成交"), ("order_count", "关联成交"),
                   ("new_names", "新人名单"), ("old_names", "老人名单")]
    # 经营概况展开面板勾选的二级项目：只筛明细列表，卡片与二级拆分保持整批口径
    rows = apply_breakdown_picks(rows, query.breakdown)
    # 明细列表这一批的口径（勾了维度就是筛完之后的），给面板底部的汇总条用
    picked_summary = {}
    if query.tab == "orders":
        buyers = {row.get("customer_id") for row in rows if row.get("customer_id")}
        upsell_buyers = {row.get("customer_id") for row in rows if row.get("customer_id") and row.get("is_upsell")}
        picked_summary = {
            "成交量": len(rows),
            "成交人数": len(buyers),
            # 升单人：一个客户只要有一笔升单就算一次；升单量：同一人多次升单按次数累加
            "升单人": len(upsell_buyers),
            "升单量": sum(1 for row in rows if row.get("is_upsell")),
            "付费项目": len({row.get("product") for row in rows if row.get("product") and row.get("product") != "coarse"}),
        }
    elif query.tab in {"overview", "courses"}:
        people = set()
        for row in rows:
            people.update(row.get("participant_ids") or [])
        picked_summary = {
            "课程数": len(rows),
            "课时数": sum(row.get("hours") or 0 for row in rows),
            "上课人数": len(people),
            "上课人次": sum(row.get("participants") or 0 for row in rows),
            "课程当日成交": sum(row.get("same_day_deals") or 0 for row in rows),
            "课程关联成交": sum(row.get("related_deals") or 0 for row in rows),
        }
    # 成交列表里再给出「该客户在这批数据里一共成交了几笔」，便于一眼看出复购客户
    if query.tab == "orders":
        per_customer = Counter(row.get("customer_id") for row in rows if row.get("customer_id"))
        for row in rows:
            row["deal_count"] = per_customer.get(row.get("customer_id"), 0)
        if query.list_view == "customer":
            # 同一人显示一次：先按日期倒序，让合并后的「项目」以最近一笔开头
            rows = sorted(rows, key=lambda row: (row["date"], row["id"]), reverse=True)
            rows = merge_orders_by_customer(rows)
            columns = [("date", "最近成交"), ("customer", "客户"), ("label", "项目"), ("organization", "成交归属"), ("classification", "购买类型"), ("deal_count", "成交笔数"), ("closers", "成交人")]
    if query.tab in {"courses", "overview"} and query.course_view == "participant":
        # 内部人员＝被该组织/俱乐部的引流人引流来的客户，需要客户档案里的引流人
        participant_customers = customers if query.tab == "overview" else {c.id: c for c in customer_service.list_customers()}
        # 累计课程 / 累计课时：该客户在当前筛选范围（组织/俱乐部 + 统计周期 + 课程类型等）里的参与合计。
        # 用 selected_courses（已经过组织、日期、活动类型、课程名筛选）统计，和列表口径完全一致。
        org_history: dict[tuple[str, str], list] = {}
        for course in selected_courses:
            for cid in course.get("participant_ids") or []:
                bucket = org_history.setdefault((course["organization_id"], cid), [0, 0.0])
                bucket[0] += 1
                bucket[1] += course.get("hours") or 0
        rows = course_participant_rows(rows, organizations, query.participant_scope, participant_customers, org_history)
        # 人员类型放在最右侧
        columns = [("date", "课程日期"), ("customer", "参与者"), ("name", "课程"), ("type", "活动类型"),
                   ("organization", "课程所属"), ("teachers", "课程老师"), ("hours", "课时数"),
                   ("org_participation_count", "累计课程"), ("org_participation_hours", "累计课时"),
                   ("participant_category", "人员类型")]
    # 点「成交笔数」时只要这个客户的记录（笔数按整批算，所以放在上面之后）
    if query.customer_id:
        rows = [row for row in rows if row.get("customer_id") == query.customer_id]
    # 排序对整批数据生效（前端点表头就是换这里的排序字段），默认按日期倒序
    if query.sort_by:
        rows = sorted(rows, key=lambda row: _sort_key(row, query.sort_by), reverse=query.sort_order == "desc")
    else:
        rows = sorted(rows, key=lambda r: (r["date"], r["id"]), reverse=True)
    total = len(rows)
    page = min(query.page, max(1, (total + query.page_size - 1) // query.page_size))
    # 内部关联字段不出 API；金额、支付方式以及客户隐私字段从未加入输出。
    safe_rows = [{key: row.get(key, "") for key in ["id", "customer_id", "course_id", "product", "subtype", "repeat_times",
                                                    "new_people", "old_people", "details", *[c[0] for c in columns]]} for row in rows]
    return {"summary": summary, "breakdown": breakdown, "list_summary": picked_summary, "columns": [{"key": k, "label": label} for k, label in columns],
            "items": safe_rows if export else safe_rows[(page - 1) * query.page_size:page * query.page_size],
            "total": total, "page": page, "page_size": query.page_size, "total_pages": max(1, (total + query.page_size - 1) // query.page_size),
            "notice": "统计限可见组织与客户。首购/首次到场按可见历史判断，同日多单不推断先后；课时沿用课程扣卡课时口径。无成交日期、归属缺失或歧义的记录不参与计算。后续交易为关联，非因果归因。"}
