"""使用情况汇总：直接聚合原始记录，不构建全量操作明细。"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from app.services import account_service, operation_log_service, position_permission_service
from app.services import login_record_service as usage

PAGE_ALIASES = {
    "客户": "客户资料",
    "客户详情": "客户资料",
    "客户编辑": "客户资料",
    "新增邀约": "邀约",
    "编辑邀约": "邀约",
    "邀约详情": "邀约",
    "新增活动": "课表",
    "活动详情": "课表",
    "新增付费项目": "付费项目",
    "编辑付费项目": "付费项目",
    "付费详情": "付费项目",
}
PAGE_KEYS = {
    "客户资料": "healing-records",
    "邀约": "class-records",
    "课表": "daily-activities",
    "付费项目": "payment",
    "自定义筛选": "custom-analysis",
    "服务老师": "service-teacher",
    "课程记录": "course-statistics",
    "客户跟进": "customer-follow-ups",
    "组织/俱乐部": "principal",
    "每日报表": "daily-report",
    "客户标签": "customer-tags",
    "沟通记录": "communication-records",
    "销卡": "payment-deductions",
    "退费": "payment-refunds",
    "欠卡记录": "debt-records",
    "账号管理": "position-management",
    "操作日志": "operation-logs",
    "使用统计": "login-records",
    "分析日志": "analysis-logs",
}


def canonical_page(value: str) -> str:
    return PAGE_ALIASES.get(value, value)


def overview(date_from: str, date_to: str, source: str = "", account_id: str = "") -> dict:
    start, end = usage._local_bounds(date_from, date_to)
    end += timedelta(microseconds=1)
    now = datetime.now(timezone.utc)
    accounts = [a for a in account_service.list_accounts() if a.enabled and a.created_at < end]
    by_id = {a.id: a for a in accounts}
    names = defaultdict(list)
    for a in accounts:
        for name in {a.owner, a.username} - {""}:
            names[name].append(a.id)
    days, latest, ever = defaultdict(set), {}, set()
    intervals, estimates = defaultdict(list), defaultdict(list)
    page_people, page_days, page_visits, page_ops = defaultdict(set), defaultdict(set), Counter(), Counter()
    person_pages, actions = defaultdict(Counter), defaultdict(Counter)

    def accept(aid, terminal):
        return aid in by_id and terminal in {"pc", "miniprogram"} and (not source or terminal == source)

    def event(aid, at, page, kind):
        ever.add(aid)
        if not start <= at < end:
            return
        day = at.astimezone(usage.CHINA_TZ).date().isoformat()
        days[aid].add(day)
        latest[aid] = max(latest.get(aid, at), at)
        if kind not in {"心跳", "登录"}:
            estimates[aid].append((at, min(at + timedelta(minutes=5), now, end)))
        if page:
            page_people[page].add(aid)
            # 常用功能按使用天数排列，避免自动保存频繁的页面被误判为更常用。
            if (aid, day) not in page_days[page]:
                person_pages[aid][page] += 1
            page_days[page].add((aid, day))
            if kind != "心跳":
                actions[page][kind] += 1
            if kind == "访问页面":
                page_visits[page] += 1
            elif kind not in {"心跳", "登录"}:
                page_ops[page] += 1

    page_name = canonical_page

    for r in usage._records():
        if accept(r.account_id, r.source) and (not account_id or r.account_id == account_id):
            event(
                r.account_id,
                r.created_at,
                page_name(r.page_name) if r.event_type != "login" else "",
                "登录" if r.event_type == "login" else "访问页面",
            )
    for log in operation_log_service.list_logs(source=source or None):
        candidates = names.get(log.operator, [])
        if len(candidates) != 1:
            continue  # 姓名归属不唯一时不猜测归属。
        aid = candidates[0]
        if not accept(aid, log.source) or (account_id and aid != account_id):
            continue
        kind = (
            "导出"
            if "export" in log.path.lower()
            else {
                "POST": "新增/提交",
                "PATCH": "修改记录",
                "PUT": "修改记录",
                "DELETE": "删除记录",
                "GET": "查询/查看",
            }.get(log.method, "其他操作")
        )
        if "/custom-analysis/execute" in log.path:
            kind = "执行筛选"
        if "/custom-analysis/templates" in log.path and log.method == "POST":
            kind = "保存模板"
        event(aid, log.created_at, page_name(log.section), kind)
    for session in usage._usage_sessions():
        aid = session.account_id
        if not accept(aid, session.source) or (account_id and aid != account_id):
            continue
        for a, b, _, page in usage._effective_intervals(session, now):
            ever.add(aid)
            a, b = max(a, start), min(b, end)
            if b <= a:
                continue
            intervals[aid].append((a, b))
            point = a
            while point < b:
                event(aid, point, page_name(page), "心跳")
                local = point.astimezone(usage.CHINA_TZ)
                point = (
                    (local + timedelta(days=1))
                    .replace(hour=0, minute=0, second=0, microsecond=0)
                    .astimezone(timezone.utc)
                )
            latest[aid] = max(latest.get(aid, a), b)
    span = (end.astimezone(usage.CHINA_TZ).date() - start.astimezone(usage.CHINA_TZ).date()).days
    threshold = max(1, (span * 3 + 6) // 7)
    people = []
    for a in accounts:
        if account_id and a.id != account_id:
            continue
        actual = usage._merged_duration(intervals[a.id], start, end)
        combined = usage._merged_duration(intervals[a.id] + estimates[a.id], start, end)
        people.append(
            {
                "account_id": a.id,
                "owner": a.owner or a.username,
                "days": len(days[a.id]),
                "latest": latest[a.id].isoformat() if a.id in latest else None,
                "seconds": actual,
                "estimated_seconds": max(0, combined - actual),
                "status": "已使用" if days[a.id] else "本期未使用" if a.id in ever else "未采集到使用记录",
                "pages": [p for p, _ in person_pages[a.id].most_common(3)],
            }
        )
    people.sort(key=lambda p: (-p["days"], p["owner"]))
    functions = [
        {
            "name": p,
            "people": len(ids),
            "days": len(page_days[p]),
            "visits": page_visits[p],
            "operations": page_ops[p],
            "actions": [{"name": k, "count": v} for k, v in actions[p].most_common()],
            "account_ids": sorted(ids),
        }
        for p, ids in page_people.items()
    ]
    functions.sort(key=lambda p: (-p["people"], -p["days"], p["name"]))
    mini_pages = {canonical_page(name) for path, name in usage.PAGE_NAMES.items() if path.startswith("/pages/")}
    permission_sets = {a.id: set(position_permission_service.get_permissions(a.roles or [a.role])) for a in accounts}
    for row in functions:
        key = PAGE_KEYS.get(row["name"])
        row["eligible"] = (
            None
            if not key or (source == "miniprogram" and row["name"] not in mini_pages)
            else sum(
                (not account_id or a.id == account_id)
                and ("超级管理员" in (a.roles or [a.role]) or key in permission_sets[a.id])
                for a in accounts
            )
        )
    return {
        "people": people,
        "functions": functions,
        "cards": {
            "used": sum(p["days"] > 0 for p in people),
            "unused": sum(p["days"] == 0 for p in people),
            "frequent": sum(p["days"] >= threshold for p in people),
            "average_days": round(sum(p["days"] for p in people) / len(people), 1) if people else 0,
            "frequent_threshold": threshold,
        },
    }
