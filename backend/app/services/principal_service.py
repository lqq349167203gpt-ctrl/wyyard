"""主理人组织经营数据。所有分析先裁剪组织与客户范围，再进行关联。"""

import json
import locale
from collections import Counter, defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.models.customer import customer_referrers
from app.models.principal import PrincipalQuery
from app.services import (
    account_service,
    customer_access_service,
    customer_service,
    customer_tag_service,
    membership_card_service,
    organization_service,
    position_edit_permission_service,
    project_deduction_service,
    upsell_config_service,
    visit_note_service,
    visit_service,
)
from app.services.payment_sources import payment_loader
from app.services.principal_conversion_service import calculate_conversion
from app.utils.customer_profile import format_work_info
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
    ("membership", "会员卡", payment_loader("membership-cards"), "card_type"),
    ("group_case", "觉醒游戏", payment_loader("group-cases"), ""),
    ("emotional", "情绪释放", payment_loader("emotional-releases"), ""),
    ("energy", "深度情绪释放", payment_loader("energy-knots"), ""),
    ("oh", "OH卡", payment_loader("oh-card-readings"), "reading_type"),
    ("internal", "沙龙技能学习", payment_loader("internal-courses"), "course_type"),
    ("other", "其他项目", payment_loader("other-projects"), "project_name"),
    ("tea", "茶位费", payment_loader("tea-seat-fees"), ""),
    ("online_tea", "线上茶疗", payment_loader("online-tea"), ""),
    ("offline", "线下课程", payment_loader("offline-courses"), "course_type"),
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
    organizations, directory, permissions = scope(request)
    views = position_edit_permission_service.principal_views(permissions)
    if not views["organization"]:
        require_statistics_view(permissions, "person")
        names = {item["name"] for item in permitted_referrers(request, organizations, directory, permissions)}
        customer = directory.get(customer_id)
        if not customer or not names.intersection(customer_referrers(customer)):
            raise HTTPException(403, "没有查看该客户的权限")
    organizations, _, _, courses = collect_data(request)
    matched = [course for course in courses
               if customer_id in (course.get("participant_ids") or []) + (course.get("owner_ids") or [])
               and (not course_id or course["id"] == course_id)]
    if not matched:
        raise HTTPException(403, "没有查看该客户的权限")
    if any(customer_id in (course.get("owner_ids") or []) for course in matched):
        return True
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


def _activity_owner_ids(kind, activity) -> set[str]:
    """案主按活动身份去重，深度情绪释放的多个部位不重复计次。"""
    if kind not in {"gcs", "ers", "eks"}:
        return set()
    owner_ids = {getattr(activity, "owner_id", "")} - {""}
    if kind == "eks":
        try:
            owners = json.loads(getattr(activity, "description", "") or "[]")
        except (ValueError, TypeError):
            owners = []
        if isinstance(owners, list):
            owner_ids.update(owner["id"] for owner in owners if isinstance(owner, dict) and owner.get("id"))
    return owner_ids


def _member_participation_breakdown(member_ids: set[str], start: str, end: str, customers=None, picks=None) -> dict:
    """指定客户跨组织参与统计，日期只约束活动发生时间，不约束客户引流时间。"""
    from app.api.statistics import (
        COURSE_ACTIVITY_TYPES,
        _course_activity_name,
        _course_activity_teacher_ids,
        _course_participant_ids,
    )

    # 沙龙具体课程沿用「课程名 + 所属组织」口径；配置只在有成员实际参与沙龙时读取。
    course_context = None
    teacher_directory = dict(customers or {})
    teacher_directory_loaded = False

    def activity_teachers(activity):
        nonlocal teacher_directory_loaded
        teacher_ids = _course_activity_teacher_ids(activity)
        if teacher_ids - teacher_directory.keys() and not teacher_directory_loaded:
            # 个人范围的客户只有引流客户，授课老师需按活动记录从完整人员目录解析。
            teacher_directory.update({customer.id: customer for customer in customer_service.list_customers()})
            teacher_directory_loaded = True
        return "、".join(teacher_directory[tid].nickname or teacher_directory[tid].name
                        for tid in sorted(teacher_ids) if tid in teacher_directory
                        and (teacher_directory[tid].nickname or teacher_directory[tid].name))

    def salon_course_key(activity, label):
        nonlocal course_context
        if course_context is None:
            orgs = organization_service.list_organizations()
            member_orgs = defaultdict(set)
            for org in orgs:
                for member_id in org.member_ids:
                    member_orgs[member_id].add(org.id)
            from app.services.course_organization_service import build_salon_organization_resolver

            course_context = (
                build_salon_organization_resolver(),
                member_orgs, {org.id: org.name for org in orgs},
            )
        resolve_salon, member_orgs, org_names = course_context
        explicit = resolve_salon(activity)
        candidates = {explicit} if explicit else set().union(*(member_orgs[tid] for tid in _course_activity_teacher_ids(activity)))
        organization = org_names.get(next(iter(candidates)), "未配置组织") if len(candidates) == 1 else "归属不明确" if candidates else "未配置组织"
        # 二级统计按沙龙类型（读书会、呼吸禅茶），不按某一场的活动名称。
        type_name = (getattr(activity, "course_type", "") or "").strip() or "未分类"
        return _course_key({"name": type_name, "organization": organization})

    from app.services import course_attendance_service

    confirmations = course_attendance_service.snapshot()
    # 每种活动、具体课程、每位成员分别累计次数，人数由成员 ID 去重。
    counts = defaultdict(lambda: [0, 0])
    member_records = defaultdict(list)
    if member_ids:
        arrived_by_day = visit_service.get_arrived_customer_ids_by_date()
        for kind, label, loader in COURSE_ACTIVITY_TYPES:
            for activity in loader():
                day = valid_day(activity.date)
                if not day or not start <= day <= end or getattr(activity, "is_deleted", False):
                    continue
                arrived_members = member_ids & course_attendance_service.attended_ids(
                    kind, activity.id, arrived_by_day.get(day, set()), record=activity, confirmations=confirmations,
                )
                if not arrived_members:
                    continue
                owner_ids = _activity_owner_ids(kind, activity)
                owners = owner_ids & arrived_members
                participants = (_course_participant_ids(kind, activity) - owner_ids) & arrived_members
                course_key = salon_course_key(activity, label) if kind == "class" and participants else ""
                if not owners and not participants:
                    continue
                # 沙龙二级类型是课程类型（读书会、呼吸禅茶），不是某一场的活动名称。
                subtype = ((getattr(activity, "course_type", "") or "").strip() or "未分类") if kind == "class" else ""
                detail = {"date": day, "name": _course_activity_name(kind, label, activity), "type": label,
                          "subtype": subtype, "activity_type": kind, "course_key": course_key,
                          "teachers": activity_teachers(activity)}
                for member_id in owners:
                    counts[(kind, member_id, course_key)][0] += 1
                    member_records[member_id].append({**detail, "role": "案主"})
                for member_id in participants:
                    counts[(kind, member_id, course_key)][1] += 1
                    member_records[member_id].append({**detail, "role": "参与者"})
    rows = [(kind, member_id, owners, participants, course_key)
            for (kind, member_id, course_key), (owners, participants) in counts.items()]
    selected_types = {pick.partition(":")[2] for pick in picks or [] if pick.startswith("participation_type:")}
    selected_members = {pick.partition(":")[2] for pick in picks or [] if pick.startswith("participation_person:")}
    selected_courses = {pick.partition(":")[2] for pick in picks or [] if pick.startswith("participation_course:")}

    def totals(selected):
        owner_ids = {member_id for _, member_id, owners, _, _ in selected if owners}
        participant_ids = {member_id for _, member_id, _, participants, _ in selected if participants}
        owners = sum(row[2] for row in selected)
        participants = sum(row[3] for row in selected)
        return {"count": owners + participants, "owner_count": owners, "participant_count": participants,
                "people": len(owner_ids | participant_ids), "owner_people": len(owner_ids),
                "participant_people": len(participant_ids)}

    type_scope = [row for row in rows if not selected_members or row[1] in selected_members]
    member_scope = [row for row in rows if (not selected_types or row[0] in selected_types)
                    and (not selected_courses or row[4] in selected_courses)]
    people = customers or {}
    by_member = []
    for member_id in {row[1] for row in member_scope}:
        customer = people.get(member_id)
        name = (customer.nickname or customer.name or "未命名") if customer else member_id
        by_member.append({"key": member_id, "label": name,
                          **totals([row for row in member_scope if row[1] == member_id])})
    by_member.sort(key=lambda item: (-item["count"], _collate(item["label"]), item["key"]))
    by_type = []
    for kind, label, _ in COURSE_ACTIVITY_TYPES:
        selected = [row for row in type_scope if row[0] == kind]
        if selected:
            item = {"key": kind, "label": label, **totals(selected)}
            if kind == "class":
                subtypes = [{"key": key, "label": key.replace("｜", " · "),
                             **totals([row for row in selected if row[4] == key])}
                            for key in {row[4] for row in selected}]
                item["subtypes"] = sorted(subtypes, key=lambda sub: (-sub["count"], _collate(sub["label"])))
            by_type.append(item)
    return {
        "overall": totals(rows),
        "totals": totals([row for row in member_scope if not selected_members or row[1] in selected_members]),
        "by_type": by_type,
        "by_participant": by_member,
        "members": [{"id": member_id,
                     "name": (people[member_id].nickname or people[member_id].name or "未命名") if member_id in people else member_id,
                     "activities": sorted(records, key=lambda record: (record["date"], record["name"], record["role"]), reverse=True)}
                    for member_id, records in member_records.items()],
    }


def _member_participation_totals(member_ids: set[str], start: str, end: str) -> dict[str, int]:
    """兼容原有的成员活动参与次数汇总入口。"""
    totals = _member_participation_breakdown(member_ids, start, end)["overall"]
    return {"活动参与次数": totals["count"], "活动案主次数": totals["owner_count"],
            "活动参与者次数": totals["participant_count"]}


def _traffic_visit_stats(visits, start: str, end: str) -> tuple[dict[str, dict[str, int]], dict[str, str], dict[str, dict]]:
    """按客户统计邀约状态；发起总数由取消、未到场、实际到场三类互斥记录组成。

    同时返回首次到店详情（日期/时间/需求/邀约人），供邀约到店列表一人一行使用。
    """
    stats: dict[str, dict[str, int]] = {}
    first_arrival: dict[str, str] = {}
    arrival_details: dict[str, dict] = {}
    for visit in visits:
        day = valid_day(getattr(visit, "visit_date", ""))
        if not day or day < start or day > end:
            continue
        bucket = stats.setdefault(
            visit.customer_id,
            {"initiated": 0, "invite": 0, "cancel": 0, "no_show": 0, "arrive": 0},
        )
        bucket["initiated"] += 1
        if getattr(visit, "cancelled", False):
            bucket["cancel"] += 1
            continue
        bucket["invite"] += 1
        if getattr(visit, "arrived", False):
            bucket["arrive"] += 1
            current_first = first_arrival.get(visit.customer_id)
            if current_first is None or day < current_first:
                first_arrival[visit.customer_id] = day
                arrival_details[visit.customer_id] = {
                    "arrive_date": day,
                    "arrive_time": (getattr(visit, "arrival_time", "") or getattr(visit, "visit_time", "") or "").strip(),
                    "needs": (getattr(visit, "needs", "") or "").strip(),
                    "inviter": (getattr(visit, "referrer_handler", "") or "").strip(),
                    "member_type": (getattr(visit, "member_type", "") or "").strip(),
                }
        else:
            bucket["no_show"] += 1
    return stats, first_arrival, arrival_details


def _ordered_activity_names(slots: list[tuple[str, str]]) -> list[str]:
    """同一天的活动按开始时间从早到晚；没有时间的排在后面。同名只保留最早的一场。"""
    names = []
    for _, activity_name in sorted(slots, key=lambda item: (item[0] == "", item[0], item[1])):
        if activity_name not in names:
            names.append(activity_name)
    return names


def _apply_visible_visit_needs(request, arrivals_by_customer: dict[str, list[dict]]) -> None:
    """来访需求用来访备注；没有跟进点查看权限时不返回内容。"""
    records = [record for rows in arrivals_by_customer.values() for record in rows]
    if not records:
        return
    if not customer_access_service.can_view_note(get_request_roles(request), "visit_need"):
        for record in records:
            record["needs"] = ""
        return
    notes = visit_note_service.filter_visible_notes(
        visit_note_service.list_notes((record.get("id") or "" for record in records), ensure_legacy=False),
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )
    lines: dict[str, list[str]] = {}
    for note in notes:
        if note.category != "visit_need":
            continue
        text = visit_note_service.display_content(note).strip()
        if text:
            lines.setdefault(note.visit_id, []).append(text)
    for record in records:
        noted = "\n".join(lines.get(record.get("id") or "", []))
        if noted or not customer_access_service.can_view_detail_tab(get_request_roles(request), "visit_need_detail"):
            record["needs"] = noted


def collect_data(request, *, metadata_only=False, course_customer_ids: set[str] | None = None):
    from app.api.statistics import (
        COURSE_ACTIVITY_TYPES,
        _course_activity_hours,
        _course_activity_name,
        _course_activity_teacher_ids,
        _course_owner_details,
        _course_owner_records,
        _course_participant_ids,
    )

    organizations, customers, permissions = scope(request)
    course_customers = set(customers) if course_customer_ids is None else set(customers) & course_customer_ids
    org_names = {o.id: o.name for o in organizations}
    all_orgs = organization_service.list_organizations()
    member_orgs = defaultdict(set)
    for org in all_orgs:
        for member_id in org.member_ids:
            member_orgs[member_id].add(org.id)
    from app.services.course_organization_service import build_salon_organization_resolver

    resolve_salon = build_salon_organization_resolver()
    events, courses = [], []
    def customer_name(cid):
        return (customers[cid].nickname or customers[cid].name or "未命名") if cid in customers else ""
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    arrived_cache = visit_service.get_arrived_customer_ids_by_date()
    from app.services import course_attendance_service

    confirmations = course_attendance_service.snapshot()
    coarse_customers = (project_deduction_service.coarse_customer_ids_by_activity()
                        if not metadata_only and permissions["customer_access"]["transaction_access"] != "none" else {})
    for kind, label, loader in COURSE_ACTIVITY_TYPES:
        for activity in loader():
            day = valid_day(activity.date)
            if not day or day > today or getattr(activity, "is_deleted", False):
                continue
            teachers = _course_activity_teacher_ids(activity)
            explicit = resolve_salon(activity)
            candidates = {explicit} if explicit else set().union(*(member_orgs[t] for t in teachers))
            # 没有明确归属且老师跨组织时，不能猜测归属或重复计课。
            if len(candidates) != 1:
                continue
            org_id = next(iter(candidates))
            if org_id not in org_names:
                continue
            participants = _course_participant_ids(kind, activity)
            owner_ids = _activity_owner_ids(kind, activity)
            # 案主单独统计，不重复计入参与者。
            participants -= owner_ids
            roster_ids = participants & course_customers
            attended_ids = course_attendance_service.attended_ids(
                kind, activity.id, arrived_cache.get(day, set()), record=activity, confirmations=confirmations,
            )
            participants = roster_ids & attended_ids
            name = _course_activity_name(kind, label, activity)
            key = f"{kind}:{activity.id}"
            if not metadata_only:
                details = _course_owner_details(kind, activity, customers, course_customers)
                if course_customer_ids is not None and kind == "eks":
                    parts = 0
                    for owner in _course_owner_records(kind, activity):
                        if (owner.get("id") or getattr(activity, "owner_id", "")) in course_customers:
                            try:
                                parts += max(1, int(owner.get("count", 1) or 1))
                            except (ValueError, TypeError):
                                parts += 1
                    details["body_part_count"] = parts
                service_participant_ids = sorted(participants)
                service_owner_ids = sorted(set(owner_ids) & course_customers & attended_ids)
                if course_customer_ids is not None and not service_participant_ids and not service_owner_ids:
                    continue
                coarse_people = [{"id": cid, "name": customer_name(cid)}
                                 for cid in sorted(coarse_customers.get((kind, activity.id), set()) & course_customers)]
                row = {
                    "id": key, "date": day, "start_time": (getattr(activity, "start_time", "") or "").strip(),
                    "name": name, "type": label, "organization_id": org_id,
                    "organization": org_names[org_id], "teachers": "、".join(filter(None, (customer_name(t) for t in sorted(teachers)))),
                    "teacher_ids": sorted(teachers),
                    "hours": _course_activity_hours(kind, activity),
                    "owner": details["owner_name"], "parts": details["body_part_count"] if kind == "eks" else "",
                    "owner_count": len(service_owner_ids),
                    "owner_ids": sorted(set(owner_ids) & course_customers),
                    "service_owner_ids": service_owner_ids,
                    "service_participant_count": len(service_participant_ids),
                    "service_participant_ids": service_participant_ids,
                    "participants": len(participants), "participant_ids": sorted(participants),
                    "participant_names": [(cid, customer_name(cid)) for cid in sorted(participants)],
                    "roster_names": [(cid, customer_name(cid)) for cid in sorted(roster_ids)],
                    "coarse_people": coarse_people,
                    "coarse_names": "、".join(person["name"] for person in coarse_people),
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
                               "label": f"{label} · {subtype}" if subtype else label, "closers": closers,
                               "recorded_at": str(getattr(payment, "created_at", "") or "")})
    if metadata_only:
        return organizations, permissions, events, courses
    # 粗门成交以有效绑定记录为准，不依赖后续课程名单或到场确认。
    if permissions["customer_access"]["transaction_access"] != "none":
        for deduction in project_deduction_service.list_deductions():
            if deduction.project_name != "粗门次卡" or deduction.is_deleted or deduction.cancelled:
                continue
            cid = deduction.customer_id
            source_org = deduction.source_organization_id
            deal_day = valid_day(deduction.deduction_date)
            if cid not in customers or source_org not in org_names or not deal_day or deal_day > today:
                continue
            if not deduction.source_activity_type or not deduction.source_activity_id:
                continue
            key = f"{deduction.source_activity_type}:{deduction.source_activity_id}"
            events.append({"id": f"coarse:{deduction.id}", "kind": "coarse_usage", "product": "coarse", "subtype": "",
                           "date": valid_day(deduction.source_activity_date) or deal_day,
                           "customer_id": cid, "customer": customer_name(cid), "course_key": key,
                           "organization_id": source_org, "organization": org_names[source_org],
                           "label": "粗门次卡 · " + (deduction.source_activity_name or "课程"),
                           "settlement_id": deduction.organization_id if deduction.organization_id in org_names else "",
                           "settlement": org_names.get(deduction.organization_id, "无权查看或未配置"),
                           "deal_date": deal_day, "count": deduction.count,
                           "recorded_at": str(getattr(deduction, "created_at", "") or ""),
                           "closers": "、".join(str(c.get("name", "")) for c in deduction.closers or []) or deduction.closer_name or ""})
    return organizations, permissions, events, courses


# 经营概况展开面板里的二级勾选：同一行单选（前端保证），跨行取交集；引流人只在客户列表上用，进口不到这里
BREAKDOWN_PICKS = {"deals": ("product", 6), "subtype": ("subtype", 8), "buy": ("classification", 4),
                   "type": ("type", 5), "course": ("name", 7), "teacher": ("teachers", 8)}


def _course_bucket():
    """课程二级项上要带的汇总：上课人数（去重）、上课人次、课程当日成交、课程关联成交。"""
    return {"people": set(), "visits": 0, "same_day": 0, "related": 0}


def _service_visit_totals(courses):
    """服务人次跨课累计；人数按可见客户 ID 去重，案主与参与者可重叠。"""
    owners = sum(course.get("owner_count", 0) for course in courses)
    participants = sum(course.get("service_participant_count", 0) for course in courses)
    owner_ids = {cid for course in courses for cid in course.get("service_owner_ids", course.get("owner_ids", [])) if cid}
    participant_ids = {cid for course in courses for cid in course.get("service_participant_ids", []) if cid}
    return {
        "服务人次": owners + participants,
        "服务案主人次": owners,
        "服务参与人次": participants,
        "服务总人数": len(owner_ids | participant_ids),
        "服务案主人数": len(owner_ids),
        "服务参与者人数": len(participant_ids),
    }


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


def _breakdown_course_key(row) -> str:
    """课程数据的二级项：沙龙活动按类型统计，其他活动按活动名称。"""
    if row.get("type") == "沙龙活动":
        return _course_key({"name": (row.get("course_subtype") or "").strip() or "未分类", "organization": row.get("organization")})
    return _course_key(row)


def _course_subtype_option(activity_type: str, course_key: str, count: int, hours, stats: dict) -> dict:
    """沙龙二级项只显示类型名，组织留给下拉分组；其他活动仍显示活动名称和所属组织。"""
    type_name, separator, organization = course_key.partition("｜")
    salon = activity_type == "沙龙活动" and separator
    return {"key": course_key, "label": type_name if salon else course_key.replace("｜", " · "),
            "organization": organization if salon else "",
            "count": count, "hours": hours, **_course_stats(stats)}


# 引流客户列表里的敏感字段：键名和 customer_access 的 sensitive_fields 一致，
# 没有权限的角色不下发这些字段，前端也就不会出现在「列表设置」里
PROFILE_FIELD_KEYS = ("visit_purpose", "trauma_history", "current_block", "work_info", "other_info")


def _profile_field_values(customer, allowed: list[str]) -> dict:
    """到访目的 / 创伤经历 / 当下卡点 / 工作情况 / 其他信息（口径与客户详情一致）。"""
    if not allowed:
        return {}
    values = {
        "visit_purpose": (getattr(customer, "tags", "") or "").strip(),
        "trauma_history": (getattr(customer, "basic_info", "") or "").strip(),
        "current_block": ((getattr(customer, "assessment", "") or "").strip()
                          or (getattr(customer, "core_situation", "") or "").strip()),
        "work_info": format_work_info(customer),
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
            # 沙龙按类型加组织筛；其他活动仍按活动名称加组织，同名在不同组织互不影响
            rows = [row for row in rows if _breakdown_course_key(row) in values]
        elif field == "classification":
            rows = [row for row in rows if values & set(row.get("purchase_rule_labels") or [row.get("classification", "")])]
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


def referrer_options(organizations, customers, *, own_scope=False) -> list[dict]:
    """列出有历史引流客户的个人；仅本人范围仍受可见组织的引流归属限制。"""
    allowed_names = set().union(*(org_referrer_names(org, customers) for org in organizations))
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    counts = Counter(name for customer in customers.values()
                     if not valid_day(getattr(customer, "referral_date", ""))
                     or valid_day(getattr(customer, "referral_date", "")) <= today
                     for name in customer_referrers(customer))
    by_name = defaultdict(list)
    for cid, customer in customers.items():
        name = (customer.nickname or customer.name or "").strip()
        if name:
            by_name[name].append(cid)
    return sorted(
        [{"id": ids[0], "name": name, "count": counts[name]} for name, ids in by_name.items()
         if (not own_scope or name in allowed_names) and len(ids) == 1 and counts[name]],
        key=lambda item: (-item["count"], _collate(item["name"]), item["id"]),
    )


def permitted_referrers(request, organizations, customers, permissions) -> list[dict]:
    """个人仍沿用组织范围，再叠加仅本人限制。"""
    if not position_edit_permission_service.principal_views(permissions)["person"]:
        return []
    options = referrer_options(organizations, customers, own_scope=permissions["principal_scope"] == "own")
    if permissions.get("principal_person_scope", "all") == "own":
        account = account_service.get_account(getattr(request.state, "user_id", ""))
        owner = (getattr(account, "owner", "") or "").strip()
        matches = [c.id for c in customers.values() if owner and owner in {c.nickname, c.name}]
        own_id = matches[0] if len(matches) == 1 else None
        options = [item for item in options if item["id"] == own_id]
    return options


def require_statistics_view(permissions, scope_type):
    if not position_edit_permission_service.principal_views(permissions).get(scope_type, False):
        raise HTTPException(403, "没有查看个人统计的权限" if scope_type == "person" else "没有查看组织/俱乐部统计的权限")


def course_participant_rows(courses, organizations, participant_scope="", customers=None, history=None):
    """每人每课一行；被课程所属组织/俱乐部的引流人引流来的客户算内部。

    history＝{(组织id, 客户id): [次数, 课时]}：该客户在这个组织/俱乐部的累计参与（不受统计周期限制）。
    """
    orgs = {org.id: org for org in organizations}
    people = customers or {}
    totals = history or {}
    referrers_by_org = {}
    rows = []
    for course in courses:
        org = orgs.get(course["organization_id"])
        if org is None:
            continue
        if org.id not in referrers_by_org:
            referrers_by_org[org.id] = org_referrer_names(org, people)
        referrer_names = referrers_by_org[org.id]
        names = dict(course.get("participant_names") or [])
        owner_ids = set(course.get("service_owner_ids", course.get("owner_ids", [])) or [])
        for cid in dict.fromkeys([*owner_ids, *(course.get("participant_ids") or [])]):
            customer = people.get(cid)
            category = "internal" if set(customer_referrers(customer)).intersection(referrer_names) else "external"
            if participant_scope and category != participant_scope:
                continue
            label = "内部人员" if category == "internal" else "外部人员"
            total_count, total_hours = totals.get((course["organization_id"], cid), (0, 0))
            rows.append({
                "id": f'{course["id"]}:participant:{cid}', "customer_id": cid, "course_id": course["id"],
                "customer": names.get(cid) or (getattr(customer, "nickname", "") or getattr(customer, "name", "")) or "未命名",
                "member_type": getattr(customer, "member_type", "") or "", "card_status": getattr(customer, "card_status", ""), "card_status_tone": getattr(customer, "card_status_tone", "neutral"), "participant_role": "案主" if cid in owner_ids else "参与者",
                "participant_category": label,
                "org_participation_count": total_count, "org_participation_hours": round(float(total_hours), 1),
                **{key: course.get(key, "") for key in ("date", "name", "type", "course_subtype", "organization_id", "organization", "teachers", "hours")},
                "details": [f'课程｜{course["name"]}', f'课程所属｜{course["organization"]}', f'人员类型｜{label}'],
            })
    return rows


def participant_course_cards(rows: list[dict]) -> list[dict]:
    """参与者列表按课程收成卡片：一堂课的人在同一张卡里，顺序沿用原来的日期倒序。"""
    grouped: dict[str, dict] = {}
    order: list[str] = []
    for row in rows:
        key = str(row.get("course_id") or row.get("id") or "")
        card = grouped.get(key)
        if card is None:
            order.append(key)
            card = {
                "id": key, "course_id": row.get("course_id") or "",
                "date": row.get("date") or "", "name": row.get("name") or "",
                "type": row.get("type") or "", "course_subtype": row.get("course_subtype") or "",
                "organization_id": row.get("organization_id") or "",
                "organization": row.get("organization") or "", "teachers": row.get("teachers") or "",
                "hours": row.get("hours") or 0, "participants": [],
            }
            grouped[key] = card
        card["participants"].append({
            "id": row.get("id") or "", "customer_id": row.get("customer_id") or "",
            "customer": row.get("customer") or "未命名",
            "member_type": row.get("member_type") or "", "card_status": row.get("card_status") or "", "card_status_tone": row.get("card_status_tone") or "neutral", "participant_role": row.get("participant_role") or "参与者",
            "org_participation_count": row.get("org_participation_count") or 0,
            "org_participation_hours": row.get("org_participation_hours") or 0,
        })
    cards = []
    for key in order:
        card = grouped[key]
        card["participants"].sort(key=lambda person: (person["participant_role"] != "案主", _collate(str(person["customer"]))))
        card["count"] = len(card["participants"])
        cards.append(card)
    return cards


PARTICIPANT_FEEDBACK_FIELDS = ("visit_need", "customer_info", "follow_up", "customer_feedback")


def participant_feedback(items: list[dict], *, course_cards=False) -> list[dict]:
    """只批量读取本页用户在课程当天的需求与反馈，不回填历史记录或逐用户查询。"""
    rows = [{**person, "date": card["date"]} for card in items for person in card["participants"]] if course_cards else items
    pairs = {(row.get("customer_id"), row.get("date")) for row in rows if row.get("customer_id") and row.get("date")}
    if not pairs:
        return items
    visits = [visit for visit in visit_service.list_basic_visits({cid for cid, _ in pairs})
              if (visit.customer_id, valid_day(visit.visit_date)) in pairs and not visit.cancelled]
    notes = visit_note_service.group_notes_by_visit({visit.id for visit in visits})
    content = defaultdict(lambda: {field: [] for field in PARTICIPANT_FEEDBACK_FIELDS})
    seen = defaultdict(set)
    legacy_fields = {"visit_need": "needs", "customer_info": "feedback", "follow_up": "healing_notes", "customer_feedback": "experience"}
    for visit in visits:
        pair = (visit.customer_id, valid_day(visit.visit_date))
        for field in PARTICIPANT_FEEDBACK_FIELDS:
            entries = notes.get(visit.id, {}).get(field, [])
            if not entries:
                text = (getattr(visit, legacy_fields[field], "") or "").strip()
                if text:
                    entries = [{"id": f"legacy-{visit.id}-{field}", "content": text,
                                "author": getattr(visit, "created_by", "") or "历史记录"}]
            for entry in entries:
                identity = entry.get("id") or json.dumps(entry, ensure_ascii=False, sort_keys=True)
                # 同一天多条邀约会投影同一条课程反馈，只保留一次。
                if identity.startswith("course-note|"):
                    identity = identity.split("|", 2)[-1]
                if not (entry.get("content") or "").strip() or (field, identity) in seen[pair]:
                    continue
                seen[pair].add((field, identity))
                content[pair][field].append(entry)
    enriched = []
    for row in rows:
        feedback = content[(row.get("customer_id"), row.get("date"))]
        enriched.append({**row, **{field: "\n".join(entry["content"] for entry in feedback[field]) for field in PARTICIPANT_FEEDBACK_FIELDS},
                         **{f"{field}_entries": feedback[field] for field in PARTICIPANT_FEEDBACK_FIELDS}})
    if not course_cards:
        return enriched
    offset = 0
    cards = []
    for card in items:
        count = len(card["participants"])
        cards.append({**card, "participants": enriched[offset:offset + count]})
        offset += count
    return cards


def _teacher_feedback(notes, teacher_id, teacher_names):
    """同一天同客户的老师反馈只整理一次，供该老师当天多堂课复用。"""
    categories = ("visit_need", "customer_info", "follow_up", "customer_feedback")
    content = {key: [] for key in categories}
    creators = {key: [] for key in categories}
    entries = {key: [] for key in categories}
    for note in notes:
        matches = (note.feedback_person_id == teacher_id if note.feedback_person_id
                   else (note.feedback_person or note.created_by) in teacher_names)
        if not matches or note.category not in content:
            continue
        text = note.content.strip()
        content[note.category].append(text)
        creator = (getattr(note, "created_by", "") or "").strip()
        entries[note.category].append(visit_note_service.note_entry(note))
        if creator and creator not in creators[note.category]:
            creators[note.category].append(creator)
    content = {key: "\n".join(values) for key, values in content.items()}
    has_info, has_point = bool(content["customer_info"]), bool(content["follow_up"])
    return {
        **content,
        **{f"{key}_creators": "、".join(names) for key, names in creators.items()},
        **{f"{key}_entries": values for key, values in entries.items()},
        "follow_up_status": "已填写" if has_info and has_point else "待补充" if has_info or has_point else "未填写",
    }


def teacher_follow_up_rows(courses, customers):
    """每堂课每位老师对应案主和参与者，按反馈人归属匹配当日邀约备注。"""
    pairs = {(cid, course["date"]) for course in courses
             for cid in (course.get("owner_ids") or []) + (course.get("participant_ids") or [])}
    if not pairs:
        return []
    visits = [visit for visit in visit_service.list_basic_visits({cid for cid, _ in pairs})
              if (visit.customer_id, valid_day(visit.visit_date)) in pairs and not visit.cancelled]
    visit_context = {visit.id: (visit.customer_id, valid_day(visit.visit_date)) for visit in visits}
    notes_by_person = defaultdict(list)
    for note in visit_note_service.list_notes(visit_context, ensure_legacy=False):
        if not (note.content or "").strip():
            continue
        cid, day = visit_context[note.visit_id]
        notes_by_person[(cid, day)].append(note)

    rows = []
    # 仅本次读取内复用，不跨账号或请求缓存隐私内容，不改变按反馈人匹配的规则。
    feedback_by_person_teacher = {}
    for course in courses:
        for teacher_id in course.get("teacher_ids") or []:
            teacher = customers.get(teacher_id)
            if not teacher:
                continue
            teacher_names = {name for name in (teacher.nickname, teacher.name) if name}
            teacher_name = teacher.nickname or teacher.name or "未命名"
            owner_ids = set(course.get("owner_ids") or [])
            people = [(cid, (customers[cid].nickname or customers[cid].name or "未命名"), "案主")
                      for cid in sorted(owner_ids) if cid in customers]
            people.extend((cid, customer_name, "参与者") for cid, customer_name in course.get("participant_names") or []
                          if cid not in owner_ids)
            for cid, customer_name, role in people:
                feedback_key = (cid, course["date"], teacher_id)
                if feedback_key not in feedback_by_person_teacher:
                    feedback_by_person_teacher[feedback_key] = _teacher_feedback(
                        notes_by_person.get((cid, course["date"]), []), teacher_id, teacher_names,
                    )
                content = feedback_by_person_teacher[feedback_key]
                rows.append({
                    "id": f'{course["id"]}:teacher:{teacher_id}:participant:{cid}',
                    "course_id": course["id"], "customer_id": cid,
                    "date": course["date"], "teachers": teacher_name, "teacher_id": teacher_id,
                    "name": course["name"], "type": course.get("type", ""),
                    "course_subtype": course.get("course_subtype", ""), "customer": customer_name,
                    "participant_role": role,
                    "organization": course["organization"],
                    **content,
                    "details": [f'课程｜{course["name"]}', f'老师｜{teacher_name}', f'身份｜{role}',
                                f'来访需求｜{content["visit_need"] or "—"}',
                                f'深度需求｜{content["customer_info"] or "—"}',
                                f'跟进点｜{content["follow_up"] or "—"}',
                                f'客户反馈｜{content["customer_feedback"] or "—"}'],
                })
    return rows


def _public_rows(rows, columns, *, teacher_feedback=False, participant_context=False):
    fields = ["id", "customer_id", "course_id", "course_subtype", "product", "subtype", "repeat_times", "card_status", "card_status_tone",
              "new_people", "old_people", "absent_people", "coarse_people", "order_count", "details", *[key for key, _ in columns]]
    if participant_context:
        fields.append("organization_id")
    if teacher_feedback:
        fields.extend(["type", "course_subtype", "participant_role", "teacher_id", *[f"{category}_{suffix}" for category in ("visit_need", "customer_info", "follow_up", "customer_feedback")
                                for suffix in ("creators", "entries")]])
    return [{key: row.get(key, "") for key in fields} for row in rows]


def _teacher_follow_up_totals(rows):
    """分页只取明细，日期和老师的应填总数仍按完整筛选结果计算。"""
    days = {}
    for row in rows:
        day = days.setdefault(row["date"], {"date": row["date"], "course_ids": set(), "teachers": {}})
        day["course_ids"].add(row["course_id"])
        teacher = day["teachers"].setdefault(row["teacher_id"], {
            "id": row["teacher_id"], "total": 0, "info": 0, "point": 0, "course_ids": set(),
        })
        teacher["total"] += 1
        teacher["info"] += bool((row.get("customer_info") or "").strip())
        teacher["point"] += bool((row.get("follow_up") or "").strip())
        teacher["course_ids"].add(row["course_id"])
    return [{"date": day["date"], "teacher_count": len(day["teachers"]),
             "course_count": len(day["course_ids"]),
             "teachers": [{"id": teacher["id"], "total": teacher["total"], "info": teacher["info"],
                           "point": teacher["point"], "course_count": len(teacher["course_ids"])}
                          for teacher in day["teachers"].values()]}
            for day in days.values()]


def analyze(request, query: PrincipalQuery, *, export=False, defer_participant_feedback=False):
    personal_scope = query.scope_type == "person"
    personal_customers = {}
    personal_name = ""
    if personal_scope:
        organizations, directory, permissions = scope(request)
        require_statistics_view(permissions, "person")
        option = next((item for item in permitted_referrers(request, organizations, directory, permissions)
                       if item["id"] == query.referrer_id), None)
        if query.referrer_id and option is None:
            raise HTTPException(403, "无权查看该个人的经营数据，或该个人暂无引流客户")
        personal_name = option["name"] if option else ""
        today_text = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
        personal_customers = {cid: customer for cid, customer in directory.items()
                              if personal_name and personal_name in customer_referrers(customer)
                              and (not valid_day(getattr(customer, "referral_date", ""))
                                   or valid_day(getattr(customer, "referral_date", "")) <= today_text)}
        organizations, permissions, events, courses = collect_data(request, course_customer_ids=set(personal_customers))
        events = [event for event in events if event.get("customer_id") in personal_customers]
    else:
        organizations, permissions, events, courses = collect_data(request)
        require_statistics_view(permissions, "organization")
    chosen = selected_orgs(organizations, query.organization_id)
    access = permissions["customer_access"]["transaction_access"]
    if query.tab in {"orders", "conversion"}:
        customer_access_service.require_transaction_access(request, detail=True)
    if query.course_view == "teacher_follow_up" and not customer_access_service.can_view_any_note(get_request_roles(request)):
        raise HTTPException(403, "没有查看跟进点的权限")
    start = query.date_from.isoformat() if query.date_from else "0001-01-01"
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    end = min(query.date_to or today, today).isoformat()
    if query.participant_history_organization_id:
        # 只查点击的用户与课程所属组织，累计口径不受下方列表的成交/拆分筛选影响。
        history_org = query.participant_history_organization_id
        if history_org not in chosen:
            raise HTTPException(403, "无权查看该组织的课程记录")
        records = [course for course in courses
                   if course["organization_id"] == history_org and start <= course["date"] <= end
                   and (not query.activity_type or course.get("activity_type") == query.activity_type)
                   and (not query.course_subtype or course.get("course_subtype") == query.course_subtype)
                   and query.customer_id in set(course.get("participant_ids") or []) | set(course.get("service_owner_ids", course.get("owner_ids", [])) or [])]
        people = personal_customers if personal_scope else {customer.id: customer for customer in customer_service.list_customers()}
        rows = [row for row in course_participant_rows(records, organizations, customers=people)
                if row["customer_id"] == query.customer_id]
        rows.sort(key=lambda row: (row["date"], row["course_id"]), reverse=True)
        columns = [("date", "课程日期"), ("name", "课程名称"), ("type", "课程类型"),
                   ("organization", "课程所属"), ("teachers", "课程老师"), ("participant_role", "本场身份"), ("hours", "课时数")]
        total = len(rows)
        pages = max(1, (total + query.page_size - 1) // query.page_size)
        page = min(query.page, pages)
        items = rows if export else rows[(page - 1) * query.page_size:page * query.page_size]
        return {"items": _public_rows(items, columns, participant_context=True), "columns": [{"key": key, "label": label} for key, label in columns],
                "total": total, "page": page, "page_size": query.page_size, "total_pages": pages,
                "summary": {"参与课程": total, "累计课时": round(sum(float(row.get("hours") or 0) for row in rows), 1)},
                "breakdown": {}, "notice": "仅统计该用户在本组织实际到场的课程，按课程日期倒序展示。"}
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
    if upsell_config_service.rules_configured():
        upsell_config_service.classify_purchases(order_timeline)
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
            # 深度情绪释放只结算部位数，没有课时；这里把部位数和案主写清楚
            course["details"].append(f'部位数｜{course["parts"]} 处｜案主｜{course["owner"] or "—"}')
        course["new_count"] = sum(first_arrival.get(cid) == course["date"] for cid in ids)
        course["old_count"] = len(ids) - course["new_count"]
        # 新人/老人名单：与课程记录页一致，按可见课程历史的首次到场日划分
        roster_names = course.get("roster_names", course.get("participant_names")) or []
        new_names = [name for cid, name in roster_names if cid in ids and first_arrival.get(cid) == course["date"]]
        old_names = [name for cid, name in roster_names if cid in ids and first_arrival.get(cid) != course["date"]]
        # 名单里的名字要能点开客户详情，所以额外给出 id
        course["new_people"] = [{"id": cid, "name": name} for cid, name in roster_names
                                if cid in ids and first_arrival.get(cid) == course["date"] and name]
        course["old_people"] = [{"id": cid, "name": name} for cid, name in roster_names
                                if cid in ids and first_arrival.get(cid) != course["date"] and name]
        course["absent_people"] = [{"id": cid, "name": name} for cid, name in roster_names if cid not in ids and name]
        course["absent_names"] = "、".join(person["name"] for person in course["absent_people"])
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
               "到场人次": sum(c["participants"] for c in selected_courses),
               **_service_visit_totals(selected_courses)}
    if access != "none":
        buyers = {e["customer_id"] for e in ranged_all}
        summary.update({"交易笔数": len(ranged_all), "成交人数": len(buyers)})
    # 经营概况：二级拆分（点这些项可以筛选下面的列表）
    breakdown = {}
    if query.tab == "overview" or (query.tab == "orders" and query.include_overview):
        # 明细沿用实际统计边界（结束日期最多到今天），不由前端重新推算。
        breakdown["record_period"] = {"from": start, "to": end}
        # 引流人存在客户档案上，这里按可见范围取一次客户（只经营概况需要）
        _, customers, _ = scope(request)
        if personal_scope:
            customers = personal_customers
        # 活动参与与“本期引流效果”分开：组织内引流人的全部历史客户都可计入，
        # 仅按活动发生日期筛选；组织成员本人不会因为成员身份自动计入。
        if personal_scope:
            participation_ids = set(customers)
        else:
            participation_referrers = set().union(*(
                org_referrer_names(org, customers) for org in organizations if org.id in chosen
            ))
            participation_ids = {
                customer.id for customer in customers.values()
                if set(customer_referrers(customer)).intersection(participation_referrers)
            }
        participation = _member_participation_breakdown(participation_ids, start, end, customers, query.breakdown)
        breakdown["participation"] = participation
        participation_totals = participation["overall"]
        summary.update({"活动参与次数": participation_totals["count"], "活动案主次数": participation_totals["owner_count"],
                        "活动参与者次数": participation_totals["participant_count"]})
        product_labels = {key: label for key, label, _, _ in PRODUCTS}
        # 下拉之间互相影响：每一维的选项按「其他维度」筛完再统计，自己这一维不参与，免得把自己的选项筛没
        picks = query.breakdown or []
        def other_picks(*exclude):
            return [pick for pick in picks if pick.split(":", 1)[0] not in exclude]
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
        buy_counts = Counter(label for order in buy_scope for label in (order.get("purchase_rule_labels") or [order["classification"]]))
        buy_buyers = defaultdict(set)
        for order in buy_scope:
            for label in order.get("purchase_rule_labels") or [order["classification"]]:
                buy_buyers[label].add(order["customer_id"])
        buy_labels = ("体验", "转化", "升单", "复购", "未匹配") if upsell_config_service.rules_configured() else ("首购", "同类复购", "跨品类首购", "升单")
        breakdown["buys"] = [{"key": name, "label": name, "count": buy_counts[name], "buyers": len(buy_buyers[name])}
                             for name in buy_labels if buy_counts.get(name)]
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
            subtype_key = _breakdown_course_key(course)
            type_subtypes[course["type"]][subtype_key] += 1
            type_subtype_hours[course["type"]][subtype_key] += hours
            _collect_course(subtype_stats[(course["type"], subtype_key)], course)
        for course in teacher_scope:
            hours = course.get("hours") or 0
            for name in str(course.get("teachers") or "").split("、"):
                if name:
                    hours_by_teacher[name] += hours
                    _collect_course(teacher_stats[name], course)
        breakdown["courses"] = {
            # 沙龙下面按类型统计；其他活动仍按活动名称。同一种类型在不同组织分开计。
            "by_type": [{"key": name, "label": name, "count": count, "hours": hours_by_type[name],
                         **_course_stats(type_stats[name]),
                         "subtypes": [_course_subtype_option(name, course_key, num, type_subtype_hours[name][course_key], subtype_stats[(name, course_key)])
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
        if personal_scope:
            member_names = {personal_name} if personal_name else set()
        customer_products = defaultdict(Counter)
        # 会员卡还要能往下看卡种：按 (大类, 卡种) 再记一份
        customer_subtypes = defaultdict(Counter)
        # 升单配置的大类按人数统计；同一客户在同一大类成交多次只算一人。
        upsell_level_definitions = upsell_config_service.list_levels()
        upsell_level_items = [
            (level, [upsell_config_service.parse_item(item) for item in level.get("products", [])])
            for level in upsell_level_definitions
        ]
        customer_upsell_levels: dict[str, set[str]] = defaultdict(set)
        upsell_customer_ids = {
            order["customer_id"] for order in ranged_all
            if order.get("customer_id") and order.get("is_upsell")
        }
        for order in ranged_all:
            customer_products[order["customer_id"]][order["product"]] += 1
            if order["product"] == "membership" and order.get("subtype"):
                customer_subtypes[order["customer_id"]][order["subtype"]] += 1
            if upsell_config_service.rules_configured():
                customer_upsell_levels[order["customer_id"]].update(order.get("purchase_rule_keys") or [])
                continue
            for level, configured_items in upsell_level_items:
                if any(
                    item_product == order["product"]
                    and (not item_subtype or item_subtype == (order.get("subtype") or ""))
                    for item_product, item_subtype in configured_items
                ):
                    customer_upsell_levels[order["customer_id"]].add(level.get("id") or level["name"])
                    break
        # 引流客户按流量来源、客户标签继续筛选
        visible_tags = customer_tag_service.visible_tags_by_customer(getattr(request.state, "user_id", ""))
        # 到访目的 / 创伤经历 / 当下卡点 / 工作情况 / 其他信息：没有权限的角色连字段都不下发
        sensitive_fields = customer_access_service.get_customer_permissions(
            get_request_roles(request)
        )["sensitive_fields"]
        allowed_profile_fields = [key for key in PROFILE_FIELD_KEYS if sensitive_fields.get(key)]
        # 未填引流人的客户统一归到「未配置」，避免总数对不上客户资料
        UNASSIGNED_REFERRER = "未配置"
        include_unassigned = not personal_scope and any(
            getattr(org, "include_unassigned_referrers", True)
            for org in organizations if org.id in chosen
        )
        referrer_products = defaultdict(Counter)
        referred = defaultdict(list)

        def referral_in_period(day):
            return start <= day <= end if day else not (query.date_from or query.date_to)

        for customer in customers.values():
            referrers = customer_referrers(customer)
            if not referrers:
                if not include_unassigned:
                    continue
                referrers = [UNASSIGNED_REFERRER]
            else:
                referrers = [name for name in referrers if name in member_names]
            if not referrers:
                continue
            # 引流人数按「引流时间」落在统计周期内才计入；未限定日期时全量纳入
            referral_day = valid_day(getattr(customer, "referral_date", ""))
            if not personal_scope and not referral_in_period(referral_day):
                continue
            counts = customer_products.get(customer.id, Counter())
            subtypes = customer_subtypes.get(customer.id, Counter())
            entry = {
                "id": customer.id,
                "name": customer.nickname or customer.name or "未命名",
                "referral_date": valid_day(getattr(customer, "referral_date", "")),
                "deals": sum(counts.values()),
                "is_upsell": customer.id in upsell_customer_ids,
                "products": [{"key": key, "label": product_labels[key], "count": counts[key]}
                             for key, _ in counts.most_common() if key in product_labels],
                # 会员卡卡种成交（其他付费项目没有子类）
                "subtypes": [{"key": key, "label": key, "count": count} for key, count in subtypes.most_common()],
                "upsell_levels": [
                    {"key": level.get("id") or level["name"], "label": level["name"], "count": 1}
                    for level in upsell_level_definitions
                    if (level.get("id") or level["name"]) in customer_upsell_levels.get(customer.id, set())
                ],
                # 未配置的归到「未配置」，筛选与人数都可见
                "identity": (getattr(customer, "member_type", "") or "").strip() or "未配置",
                "card_status": getattr(customer, "card_status", ""), "card_status_tone": getattr(customer, "card_status_tone", "neutral"),
                "follow_up_status": (getattr(customer, "follow_up_status", "") or "").strip() or "未配置",
                "traffic_source": (getattr(customer, "traffic_source", "") or "").strip() or "未配置",
                "tags": [tag.get("name", "") for tag in visible_tags.get(customer.id, []) if tag.get("name")],
                "referrer_handler": (getattr(customer, "referrer_handler", "") or "").strip(),
                **_profile_field_values(customer, allowed_profile_fields),
            }
            for referrer in referrers:
                referrer_products[referrer].update(counts)
                referred[referrer].append(entry)
        traffic_entries = [
            {**item, "referrer": referrer}
            for referrer, items in referred.items() for item in items
        ]
        # 引流客户的邀约 / 取消邀约 / 到店 / 平均到店间隔：按统计区间，口径与客户详情一致
        referred_ids = {entry["id"] for entry in traffic_entries if entry.get("id")}
        basic_visits = visit_service.list_basic_visits(referred_ids)
        visit_stats, first_arrival, arrival_details = _traffic_visit_stats(basic_visits, start, end)
        # 参与活动：该客户在统计区间内到场参与的课程/活动场次
        activity_keys = defaultdict(list)
        for event in events:
            if event.get("kind") == "attendance" and start <= event.get("date", "") <= end:
                activity_keys[event["customer_id"]].append(event["course_key"])
        # 当日成交：笔数给原列表，成交内容给日期卡片。含粗门次卡扣卡。
        purchase_counts: Counter = Counter()
        same_day_deal_labels: dict[tuple[str, str], list[str]] = defaultdict(list)
        for event in events:
            if event.get("kind") not in ("purchase", "coarse_usage") or not event.get("customer_id"):
                continue
            deal_day = event.get("date") or event.get("deal_date") or ""
            purchase_counts[(event["customer_id"], deal_day)] += 1
            deal_label = (event.get("label") or "").strip()
            if deal_label:
                same_day_deal_labels[(event["customer_id"], deal_day)].append(deal_label)
        # 当日参加活动：到场的案主和参与者都算，同一天按开始时间从早到晚，最早的排在最左。
        same_day_activity_times: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
        for course in courses:
            day = course.get("date") or ""
            activity_name = (course.get("name") or "").strip()
            if not day or not activity_name or not start <= day <= end:
                continue
            start_time = (course.get("start_time") or "").strip()
            attended = set(course.get("participant_ids") or []) | set(course.get("service_owner_ids") or [])
            for customer_id in attended:
                slot = same_day_activity_times[(customer_id, day)]
                if (start_time, activity_name) not in slot:
                    slot.append((start_time, activity_name))
        same_day_activities = {key: _ordered_activity_names(slots) for key, slots in same_day_activity_times.items()}
        invite_visits_by_customer: dict[str, list[dict]] = defaultdict(list)
        for visit in basic_visits:
            day = valid_day(getattr(visit, "visit_date", ""))
            if not day or not start <= day <= end:
                continue
            if getattr(visit, "cancelled", False):
                status, status_label = "cancelled", "已取消"
            elif getattr(visit, "arrived", False):
                status, status_label = "arrived", "已到店"
            else:
                status, status_label = "no_show", "未到店"
            invite_visits_by_customer[visit.customer_id].append({
                "id": getattr(visit, "id", ""),
                "arrive_date": day,
                "arrive_time": (getattr(visit, "arrival_time", "") or getattr(visit, "visit_time", "") or "").strip(),
                "needs": (getattr(visit, "needs", "") or "").strip(),
                "arrive_inviter": (getattr(visit, "referrer_handler", "") or "").strip(),
                "same_day_activities": "、".join(same_day_activities.get((visit.customer_id, day), [])),
                "same_day_deals": purchase_counts.get((visit.customer_id, day), 0),
                "same_day_deal_text": "、".join(same_day_deal_labels.get((visit.customer_id, day), [])),
                "status": status,
                "status_label": status_label,
            })
        _apply_visible_visit_needs(request, invite_visits_by_customer)
        arrivals_by_customer = {
            customer_id: [{key: value for key, value in record.items() if key not in ("status", "status_label", "same_day_activities", "same_day_deal_text")}
                          for record in records if record["status"] == "arrived"]
            for customer_id, records in invite_visits_by_customer.items()
        }
        today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
        for entry in traffic_entries:
            customer_id = entry.get("id", "")
            bucket = visit_stats.get(customer_id, {})
            entry["initiated_count"] = bucket.get("initiated", 0)
            entry["invite_count"] = bucket.get("invite", 0)
            entry["cancel_count"] = bucket.get("cancel", 0)
            entry["no_show_count"] = bucket.get("no_show", 0)
            entry["arrive_count"] = bucket.get("arrive", 0)
            entry["activity_keys"] = activity_keys.get(customer_id, [])
            entry["activity_count"] = len(entry["activity_keys"])
            arrive_count = bucket.get("arrive", 0)
            first = first_arrival.get(customer_id)
            entry["visit_interval"] = (
                f"{round((today - date.fromisoformat(first)).days / arrive_count)}天"
                if first and arrive_count else "-"
            )
            arrival = arrival_details.get(customer_id) or {}
            entry["arrive_date"] = arrival.get("arrive_date", "")
            entry["arrive_time"] = arrival.get("arrive_time", "")
            entry["needs"] = arrival.get("needs", "")
            entry["arrive_inviter"] = arrival.get("inviter", "")
            entry["same_day_deals"] = purchase_counts.get((customer_id, entry["arrive_date"]), 0) if entry["arrive_date"] else 0
            entry["arrival_records"] = arrivals_by_customer.get(customer_id, [])
            entry["invite_visits"] = invite_visits_by_customer.get(customer_id, [])

        # 邀约人维度：先把参与过邀约的人员挂到客户上，供各筛选项联动。
        entry_inviters: dict[str, set[str]] = defaultdict(set)
        for visit in basic_visits:
            day = valid_day(getattr(visit, "visit_date", ""))
            if not day or day < start or day > end:
                continue
            inviter = (getattr(visit, "referrer_handler", "") or "").strip() or "未配置"
            entry_inviters[visit.customer_id].add(inviter)
        for entry in traffic_entries:
            entry["inviters"] = sorted(entry_inviters.get(entry.get("id", ""), []))

        def upsell_situations(entry: dict) -> list[str]:
            level_keys = [level.get("key", "") for level in entry.get("upsell_levels", [])]
            # 配置顺序就是升单顺序；客户归到当前达到的最高一档，避免一人同时落入多个档位。
            return level_keys if upsell_config_service.rules_configured() else level_keys[-1:]

        def matched(entry, exclude_prefix: str) -> bool:
            selected_upsell = {
                pick.partition(":")[2] for pick in picks if pick.startswith("upsell:")
            }
            if exclude_prefix != "upsell" and selected_upsell:
                if not selected_upsell.intersection(upsell_situations(entry)):
                    return False
            for pick in picks:
                prefix, _, value = pick.partition(":")
                if prefix == exclude_prefix or prefix not in ("traffic", "stage", "source", "tag", "identity", "card_status", "inviter"):
                    continue
                if prefix == "traffic" and entry["referrer"] != value:
                    return False
                if prefix == "source" and entry["traffic_source"] != value:
                    return False
                if prefix == "tag" and value not in entry["tags"]:
                    return False
                if prefix == "identity" and (entry["identity"] or "") != value:
                    return False
                if prefix == "card_status" and entry.get("card_status", "") != value:
                    return False
                if prefix == "inviter" and value not in entry.get("inviters", []):
                    return False
            return True

        def traffic_facet(prefix: str, values_of) -> list[dict]:
            counter = Counter()
            seen = set()
            for entry in traffic_entries:
                if personal_scope and not referral_in_period(entry["referral_date"]):
                    continue
                if matched(entry, prefix):
                    for value in values_of(entry):
                        key = (entry["id"], value)
                        if key not in seen:
                            seen.add(key)
                            counter[value] += 1
            return [{"key": name, "label": name, "count": count} for name, count in counter.most_common()]

        # 发起邀约列表：按邀约人汇总，同时保留每一笔日期、客户和状态。
        # 这里应用除“邀约人”以外的当前筛选，邀约人自身的勾选在前端只控制展示哪一组。
        entry_by_id = {entry.get("id", ""): entry for entry in traffic_entries if entry.get("id")}
        inviter_records: dict[str, list[dict]] = defaultdict(list)
        for visit in basic_visits:
            # “发起邀约”看的是这条邀约何时被创建，而不是客户预计哪天到访。
            day = valid_day(getattr(visit, "created_at", ""))
            entry = entry_by_id.get(getattr(visit, "customer_id", ""))
            if not day or day < start or day > end or not entry or not matched(entry, "inviter"):
                continue
            inviter = (getattr(visit, "referrer_handler", "") or "").strip() or "未配置"
            if getattr(visit, "cancelled", False):
                status, status_label = "cancelled", "已取消"
            elif getattr(visit, "arrived", False):
                status, status_label = "arrived", "已到场"
            else:
                status, status_label = "no_show", "未到场"
            inviter_records[inviter].append({
                "id": getattr(visit, "id", ""),
                "date": day,
                "visit_date": valid_day(getattr(visit, "visit_date", "")),
                "customer_id": getattr(visit, "customer_id", ""),
                "customer": entry.get("name", "") or "未命名客户",
                "name": entry.get("name", "") or "未命名客户",
                "identity": entry.get("identity", "") or "未配置", "card_status": entry.get("card_status", ""), "card_status_tone": entry.get("card_status_tone", "neutral"),
                "referrer": entry.get("referrer", ""),
                "referrer_handler": entry.get("referrer_handler", ""),
                "follow_up_status": entry.get("follow_up_status", ""),
                "traffic_source": entry.get("traffic_source", ""),
                "tags": entry.get("tags", []),
                "deals": entry.get("deals", 0),
                "invite_count": entry.get("invite_count", 0),
                "cancel_count": entry.get("cancel_count", 0),
                "no_show_count": entry.get("no_show_count", 0),
                "arrive_count": entry.get("arrive_count", 0),
                "activity_count": entry.get("activity_count", 0),
                "visit_interval": entry.get("visit_interval", ""),
                "same_day_deals": entry.get("same_day_deals", 0),
                "arrive_inviter": inviter,
                **{key: entry.get(key, "") for key in allowed_profile_fields},
                "status": status,
                "status_label": status_label,
            })

        # 下拉选项之间互相影响：统计某一维时，用「其他维」筛过的客户来算
        traffic_by_referrer = defaultdict(list)
        for entry in traffic_entries:
            if matched(entry, "traffic"):
                traffic_by_referrer[entry["referrer"]].append(entry)

        def _visit_totals(entries: list[dict]) -> tuple[int, int]:
            """一批客户的发起人次、邀约到店人次（取消+未到+已到）。"""
            initiated = sum(item.get("initiated_count", 0) for item in entries)
            invited = sum(
                (item.get("cancel_count") or 0)
                + (item.get("no_show_count") or 0)
                + (item.get("arrive_count") or 0)
                for item in entries
            )
            return initiated, invited

        breakdown["traffic"] = []
        if personal_scope:
            breakdown["invite_traffic"] = []
        for name, _items in sorted(referred.items(), key=lambda pair: (-len(traffic_by_referrer.get(pair[0], [])), pair[0])):
            group = traffic_by_referrer.get(name)
            if not group:
                continue
            initiated_count, invited_count = _visit_totals(group)
            if personal_scope:
                breakdown["invite_traffic"].append({"key": name, "label": name, "count": len(group), "customers": group,
                                                    "initiated_count": initiated_count, "invite_count": invited_count})
                group = [entry for entry in group if referral_in_period(entry["referral_date"])]
                if not group:
                    continue
                initiated_count, invited_count = _visit_totals(group)
            group_products = referrer_products[name]
            if personal_scope:
                group_products = Counter()
                for entry in group:
                    for product in entry["products"]:
                        group_products[product["key"]] += product["count"]
            breakdown["traffic"].append({
                "key": name, "label": name, "count": len(group),
                "deal_count": sum(item["deals"] for item in group),
                "customers": group,
                "initiated_count": initiated_count,
                "invite_count": invited_count,
                "products": [{"key": key, "label": product_labels[key], "count": num}
                             for key, num in group_products.most_common() if key in product_labels],
            })

        breakdown["invite_inviters"] = []
        for name, records in sorted(inviter_records.items(), key=lambda pair: (-len(pair[1]), pair[0])):
            ordered_records = sorted(
                records,
                key=lambda item: (item["date"], item["customer"], item["id"]),
                reverse=True,
            )
            breakdown["invite_inviters"].append({
                "key": name,
                "label": name,
                "count": len({item["customer_id"] for item in records}),
                "initiated_count": len(records),
                "invite_count": len(records),
                "cancel_count": sum(item["status"] == "cancelled" for item in records),
                "no_show_count": sum(item["status"] == "no_show" for item in records),
                "arrive_count": sum(item["status"] == "arrived" for item in records),
                "records": ordered_records,
            })

        upsell_counts = {
            item["key"]: item["count"]
            for item in traffic_facet("upsell", upsell_situations)
        }
        breakdown["traffic_filters"] = {
            "source": traffic_facet("source", lambda entry: [entry["traffic_source"]] if entry["traffic_source"] else []),
            "tag": traffic_facet("tag", lambda entry: entry["tags"]),
            "upsell": [
                {
                    "key": level.get("id") or level["name"],
                    "label": level["name"],
                    "count": upsell_counts.get(level.get("id") or level["name"], 0),
                }
                for level in upsell_level_definitions
            ],
            # 会员身份人数：跟着当前所有筛选走（它本身不是筛选项，只是给人看结构）
            "identity": traffic_facet("identity", lambda entry: [entry["identity"]] if entry["identity"] else []),
            "card_status": traffic_facet("card_status", lambda entry: [entry["card_status"]] if entry.get("card_status") else []),
        }
        breakdown["traffic_upsell_levels"] = [
            {"key": level.get("id") or level["name"], "label": level["name"], "count": 0}
            for level in upsell_level_definitions
        ]
        breakdown["purchase_rules_configured"] = upsell_config_service.rules_configured()
        # 前端「列表设置」按这个决定哪些敏感列可以出现
        breakdown["traffic_profile_fields"] = allowed_profile_fields
        summary["引流人数"] = len({entry["id"] for entry in traffic_entries
                                 if not personal_scope or referral_in_period(entry["referral_date"])})
        summary["课程当日成交数"] = sum(c.get("same_day_deals", 0) for c in selected_courses)
        summary["课程关联成交数"] = sum(c.get("related_deals", 0) for c in selected_courses)
    if query.tab == "conversion":
        result = calculate_conversion(events, query.rule, chosen, start, end,
                                      customer_rows=conversion_customer_rows(request, query.rule, events))
        summary = result["summary"]
        rows = [r for r in result["items"] if not query.status or r["status"] == query.status]
        columns = [("customer", "客户"), ("date", "起点日期"), ("organization", "起点组织"), ("source", "起点"), ("deadline", "观察截止"), ("status_label", "状态"), ("target_count", "匹配目标数"), ("same_day", "说明")]
    elif query.tab == "orders":
        rows = [r for r in ranged_orders if not query.order_filter or query.order_filter in r.get("purchase_rule_keys", []) or r["order_kind"] == query.order_filter]
        if query.product in {"", "coarse"}:
            for usage in events:
                if usage["kind"] != "coarse_usage" or usage.get("settlement_id") not in chosen or not start <= usage.get("deal_date", "") <= end:
                    continue
                if query.order_filter and query.order_filter not in usage.get("purchase_rule_keys", []) and usage.get("order_kind") != query.order_filter:
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
                   ("hours", "课时数"), ("participants", "到场人数"), ("same_day_deals", "当日成交"),
                   ("new_names", "新人名单"), ("old_names", "老人名单"), ("coarse_names", "粗门客户"), ("absent_names", "未到店")]
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
            **_service_visit_totals(rows),
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
        if personal_scope:
            participant_customers = directory
        # 累计课程 / 累计课时：该客户在当前筛选范围（组织/俱乐部 + 统计周期 + 课程类型等）里的参与合计。
        # 用 selected_courses（已经过组织、日期、活动类型、课程名筛选）统计，和列表口径完全一致。
        org_history: dict[tuple[str, str], list] = {}
        for course in selected_courses:
            for cid in set(course.get("participant_ids") or []) | set(course.get("service_owner_ids", course.get("owner_ids", [])) or []):
                bucket = org_history.setdefault((course["organization_id"], cid), [0, 0.0])
                bucket[0] += 1
                bucket[1] += course.get("hours") or 0
        rows = course_participant_rows(rows, organizations, query.participant_scope, participant_customers, org_history)
        columns = [("date", "课程日期"), ("customer", "用户"), ("member_type", "会员身份"), ("card_status", "当前卡次"), ("participant_role", "本场身份"),
                   ("name", "课程"), ("type", "活动类型"),
                   ("organization", "课程所属"), ("teachers", "课程老师"), ("hours", "课时数"),
                   ("org_participation_count", "累计课程"), ("org_participation_hours", "累计课时")]
        if customer_access_service.can_view_any_note(permissions=permissions["customer_access"]):
            columns += [("visit_need", "来访需求"), ("customer_info", "深度需求"), ("follow_up", "跟进点"), ("customer_feedback", "客户反馈")]
    elif query.tab in {"courses", "overview"} and query.course_view == "teacher_follow_up":
        people = {c.id: c for c in customer_service.list_customers()}
        rows = teacher_follow_up_rows(rows, people)
        columns = [("date", "课程日期"), ("teachers", "课程老师"), ("name", "课程"),
                   ("customer", "人员"), ("participant_role", "身份"), ("follow_up_status", "跟进状态"),
                   ("visit_need", "来访需求"), ("customer_info", "深度需求"),
                   ("follow_up", "跟进点"), ("customer_feedback", "客户反馈")]
    # 点「成交笔数」时只要这个客户的记录（笔数按整批算，所以放在上面之后）
    if query.customer_id:
        rows = [row for row in rows if row.get("customer_id") == query.customer_id]
    # 排序对整批数据生效（前端点表头就是换这里的排序字段），默认按日期倒序
    if query.sort_by:
        rows = sorted(rows, key=lambda row: _sort_key(row, query.sort_by), reverse=query.sort_order == "desc")
    elif query.tab in {"courses", "overview"} and query.course_view == "teacher_follow_up":
        rows = sorted(rows, key=lambda row: (row["date"], row.get("course_id", ""),
                                              row.get("participant_role") == "案主", row["id"]), reverse=True)
    else:
        rows = sorted(rows, key=lambda r: (r["date"], r["id"]), reverse=True)
    total = len(rows)
    teacher_group_totals = _teacher_follow_up_totals(rows) if query.mobile_group == "courses" and query.course_view == "teacher_follow_up" else []
    page = min(query.page, max(1, (total + query.page_size - 1) // query.page_size))
    # 内部关联字段不出 API；金额、支付方式以及客户隐私字段从未加入输出。
    page_rows = rows if export else rows[(page - 1) * query.page_size:page * query.page_size]
    participant_notes = query.tab in {"courses", "overview"} and query.course_view == "participant" and customer_access_service.can_view_any_note(permissions=permissions["customer_access"])
    if participant_notes and not defer_participant_feedback:
        page_rows = participant_feedback(page_rows)
    safe_rows = _public_rows(page_rows, columns, teacher_feedback=query.tab in {"courses", "overview"} and (query.course_view == "teacher_follow_up" or participant_notes),
                            participant_context=query.tab in {"courses", "overview"} and query.course_view == "participant")
    safe_rows = customer_access_service.protect_note_payload(safe_rows, permissions=permissions.get("customer_access", {}))
    columns = [(key, label) for key, label in columns if key not in PARTICIPANT_FEEDBACK_FIELDS
               or customer_access_service.can_view_note((), key, permissions=permissions.get("customer_access", {}))]
    participation_notice = ""
    if "活动参与次数" in summary:
        participation_notice = ("活动参与按所选个人的全部引流客户统计。" if personal_scope
                                else "活动参与按所选组织所属引流人的全部客户统计。")
        participation_notice += "仅按活动日期筛选，不限制引流日期，包含跨组织活动。"
    return {"summary": summary, "breakdown": breakdown, "list_summary": picked_summary, "columns": [{"key": k, "label": label} for k, label in columns],
            "items": safe_rows, "teacher_group_totals": teacher_group_totals,
            "total": total, "page": page, "page_size": query.page_size, "total_pages": max(1, (total + query.page_size - 1) // query.page_size),
            "notice": f"课程与交易统计限可见组织与客户，不计无成交日期、归属缺失或歧义的记录。{participation_notice}首购/首次到场按可见历史判断，同日多单不推断先后；课时沿用课程扣卡课时口径。后续交易为关联，非因果归因。"}
