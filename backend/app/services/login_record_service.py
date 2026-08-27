import threading
import uuid
from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.models.login_record import LoginRecord
from app.models.usage_session import UsageInterval, UsageSession
from app.services.storage import load_data, load_item, save_item
from app.utils.pagination import paginate

FILENAME = "login_records.json"
USAGE_FILENAME = "usage_sessions.json"
CHINA_TZ = ZoneInfo("Asia/Shanghai")
HEARTBEAT_GRACE_SECONDS = 90
ACTIVITY_FALLBACK_SECONDS = 5 * 60
_page_view_lock = threading.Lock()
_recent_page_views: dict[tuple[str, str, str], datetime] = {}

PAGE_NAMES = {
    # PC 管理端
    "/custom-analysis": "自定义筛选",
    "/business-reminders": "提醒",
    "/referral-statistics": "引流统计",
    "/member-statistics": "会员情况",
    "/course-statistics": "课程",
    "/product-sales": "产品销售",
    "/statistics": "服务数据",
    "/financial-overview": "财务数据",
    "/daily-report": "每日报表",
    "/healing-records": "客户资料",
    "/courses/class-records": "邀约",
    "/courses/daily-activities": "课表",
    "/offline-course-records": "落地课程",
    "/communication-records": "沟通记录",
    "/followup-records": "回访记录",
    "/payment": "付费项目",
    "/payment-deductions": "销卡",
    "/payment-refunds": "退费",
    "/expenses": "支出项",
    "/debt-records": "欠卡记录",
    "/config/member-identities": "会员身份",
    "/config/customer-tags": "客户标签",
    "/healing-identities": "疗愈老师",
    "/organizations": "组织信息",
    "/courses/spaces": "空间配置",
    "/config/reminders": "提醒配置",
    "/positions/management": "账号管理",
    "/change-password": "密码修改",
    "/disabled-customers": "停用客户",
    "/agents": "AI 配置",
    "/chat-history": "沟通记录",
    "/system-logs": "系统日志",
    "/operation-logs": "操作日志",
    "/login-records": "使用统计",
    "/analysis-logs": "分析日志",
    # 管理员小程序
    "/pages/customers/index": "客户",
    "/pages/customer-form/index": "客户编辑",
    "/pages/customer-profile/index": "客户详情",
    "/pages/customer-tags/index": "客户标签",
    "/pages/visits/index": "邀约",
    "/pages/visit-create/index": "新增邀约",
    "/pages/visit-edit/index": "编辑邀约",
    "/pages/visit-detail/index": "邀约详情",
    "/pages/activities/index": "课表",
    "/pages/activity-create/index": "新增活动",
    "/pages/activity-detail/index": "活动详情",
    "/pages/payment/index": "付费项目",
    "/pages/payment-create/index": "新增付费项目",
    "/pages/payment-edit/index": "编辑付费项目",
    "/pages/payment-detail/index": "付费详情",
    "/pages/expenses/index": "支出项",
    "/pages/expense-form/index": "支出编辑",
    "/pages/daily-report/index": "每日报表",
    "/pages/communication-records/index": "沟通记录",
    "/pages/communication-records/form": "沟通记录编辑",
    "/pages/voice-chat/index": "语音助手",
    "/pages/text-editor/index": "文本编辑",
    "/pages/me/index": "我的",
    "/pages/custom-analysis/index": "自定义筛选",
}


def _records() -> list[LoginRecord]:
    return [LoginRecord(**item) for item in (load_data(FILENAME) or {}).values()]


def _save(record: LoginRecord) -> LoginRecord:
    save_item(FILENAME, record.id, record.model_dump(mode="json"))
    return record


def _page_name(path: str) -> str:
    if path.startswith("/healing-records/"):
        return "客户资料"
    if path.startswith("/agents/"):
        return "AI 对话"
    return PAGE_NAMES.get(path, path.rsplit("/", 1)[-1] or "未知页面")


def _usage_sessions() -> list[UsageSession]:
    return [UsageSession(**item) for item in (load_data(USAGE_FILENAME) or {}).values()]


def record_usage_heartbeat(
    account: Any,
    client_session_id: str,
    source: str,
    ip: str,
    page_path: str,
    active: bool,
    device_info: str = "",
) -> UsageSession:
    """记录活跃心跳；连续心跳合并为页面时间段，超过90秒的间隔不计时。"""
    now = datetime.now(timezone.utc)
    path = page_path.split("?", 1)[0].strip()
    item_id = f"{account.id}:{client_session_id}"
    stored = load_item(USAGE_FILENAME, item_id)
    session = UsageSession(**stored) if stored else UsageSession(
        id=item_id,
        account_id=account.id,
        username=account.username,
        owner=account.owner or "",
        role=account.role,
        source=source,
        ip=ip,
        device_info=device_info,
        started_at=now,
        last_heartbeat_at=now,
        current_page_path=path,
        intervals=[],
    )

    previous_at = session.last_heartbeat_at
    gap_seconds = max(0.0, (now - previous_at).total_seconds())
    is_continuous = gap_seconds <= HEARTBEAT_GRACE_SECONDS

    if session.intervals and is_continuous and session.ended_at is None:
        # 心跳到达时先结算上一页面到当前时刻，再决定是否开启新页面区间。
        session.intervals[-1].end_at = now

    if active:
        if session.ended_at is not None or not is_continuous:
            session.intervals.append(UsageInterval(
                start_at=now,
                end_at=now,
                page_path=path,
                page_name=_page_name(path),
            ))
        elif not session.intervals:
            session.intervals.append(UsageInterval(
                start_at=now,
                end_at=now,
                page_path=path,
                page_name=_page_name(path),
            ))
        elif session.current_page_path != path:
            session.intervals.append(UsageInterval(
                start_at=now,
                end_at=now,
                page_path=path,
                page_name=_page_name(path),
            ))
        session.ended_at = None
        session.current_page_path = path
    else:
        session.ended_at = now

    session.last_heartbeat_at = now
    session.source = source
    session.ip = ip or session.ip
    session.device_info = device_info or session.device_info
    save_item(USAGE_FILENAME, item_id, session.model_dump(mode="json"))
    return session


def _effective_intervals(session: UsageSession, now: datetime | None = None) -> list[tuple[datetime, datetime, str, str]]:
    current_time = now or datetime.now(timezone.utc)
    result = [
        (interval.start_at, interval.end_at, interval.page_path, interval.page_name)
        for interval in session.intervals
    ]
    if (
        result
        and session.ended_at is None
        and (current_time - session.last_heartbeat_at).total_seconds() <= HEARTBEAT_GRACE_SECONDS
    ):
        start_at, _, page_path, page_name = result[-1]
        result[-1] = (start_at, current_time, page_path, page_name)
    return result


def _merged_duration(
    intervals: list[tuple[datetime, datetime]],
    range_start: datetime,
    range_end: datetime,
) -> int:
    clipped = sorted(
        (max(start, range_start), min(end, range_end))
        for start, end in intervals
        if end > range_start and start < range_end and end > start
    )
    if not clipped:
        return 0
    merged: list[list[datetime]] = []
    for start, end in clipped:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        elif end > merged[-1][1]:
            merged[-1][1] = end
    return round(sum((end - start).total_seconds() for start, end in merged))


def _fallback_activity_intervals(
    activity_times: list[datetime],
    now: datetime,
) -> list[tuple[datetime, datetime]]:
    """将页面访问和业务操作转换为兜底活跃区间，5 分钟无新活动后停止计时。"""
    return [
        (activity_at, min(activity_at + timedelta(seconds=ACTIVITY_FALLBACK_SECONDS), now))
        for activity_at in activity_times
        if activity_at < now
    ]


def record_login(account: Any, source: str, ip: str, device_info: str = "") -> LoginRecord:
    return _save(LoginRecord(
        id=str(uuid.uuid4()),
        event_type="login",
        account_id=account.id,
        username=account.username,
        owner=account.owner or "",
        role=account.role,
        source=source,
        ip=ip,
        device_info=device_info,
        created_at=datetime.now(timezone.utc),
    ))


def record_page_view(account: Any, source: str, ip: str, page_path: str, device_info: str = "") -> LoginRecord | None:
    path = page_path.split("?", 1)[0].strip()
    if not path or path in {"/", "/login", "/pages/login/index"}:
        return None

    # 客户端只在路由变化时上报；后端再做短时去重，防止并发首屏请求重复写入。
    now = datetime.now(timezone.utc)
    cache_key = (account.id, source, path)
    with _page_view_lock:
        recent_at = _recent_page_views.get(cache_key)
        if recent_at and (now - recent_at).total_seconds() < 10:
            return None
        _recent_page_views[cache_key] = now

    return _save(LoginRecord(
        id=str(uuid.uuid4()),
        event_type="page_view",
        account_id=account.id,
        username=account.username,
        owner=account.owner or "",
        role=account.role,
        source=source,
        ip=ip,
        device_info=device_info,
        page_path=path,
        page_name=_page_name(path),
        created_at=now,
    ))


def _local_bounds(date_from: str | None, date_to: str | None) -> tuple[datetime | None, datetime | None]:
    start = end = None
    if date_from:
        start_date = datetime.strptime(date_from, "%Y-%m-%d").date()
        start = datetime.combine(start_date, time.min, tzinfo=CHINA_TZ).astimezone(timezone.utc)
    if date_to:
        end_date = datetime.strptime(date_to, "%Y-%m-%d").date()
        end = datetime.combine(end_date, time.max, tzinfo=CHINA_TZ).astimezone(timezone.utc)
    return start, end


def _usage_interval_indexes(
    relevant_accounts: set[tuple[str, str]] | None = None,
    now: datetime | None = None,
) -> tuple[
    dict[tuple[str, str, str], list[tuple[datetime, datetime]]],
    dict[tuple[str, str, str], list[tuple[datetime, datetime]]],
]:
    """按账号、终端及页面建立活跃区间索引，避免每条操作重复扫描全部会话。"""
    path_index: dict[tuple[str, str, str], list[tuple[datetime, datetime]]] = {}
    name_index: dict[tuple[str, str, str], list[tuple[datetime, datetime]]] = {}
    current_time = now or datetime.now(timezone.utc)
    for session in _usage_sessions():
        account_source = (session.account_id, session.source)
        if relevant_accounts is not None and account_source not in relevant_accounts:
            continue
        for interval_start, interval_end, page_path, page_name in _effective_intervals(session, current_time):
            if page_path:
                path_index.setdefault((*account_source, page_path), []).append((interval_start, interval_end))
            if page_name:
                name_index.setdefault((*account_source, page_name), []).append((interval_start, interval_end))
    return path_index, name_index


def _activity_page_duration(
    indexes: tuple[
        dict[tuple[str, str, str], list[tuple[datetime, datetime]]],
        dict[tuple[str, str, str], list[tuple[datetime, datetime]]],
    ],
    account_id: str,
    source: str,
    activity_at: datetime,
    page_path: str,
    page_name: str,
) -> int:
    """返回操作对应页面区间时长；页面事件可比首个心跳早最多 10 秒。"""
    path_index, name_index = indexes
    groups = (
        path_index.get((account_id, source, page_path), []) if page_path else [],
        name_index.get((account_id, source, page_name), []) if page_name else [],
    )
    for intervals in groups:
        candidates: list[tuple[float, datetime, datetime]] = []
        for interval_start, interval_end in intervals:
            if interval_start <= activity_at <= interval_end:
                distance = 0.0
            elif activity_at < interval_start and (interval_start - activity_at).total_seconds() <= 10:
                distance = (interval_start - activity_at).total_seconds()
            else:
                continue
            candidates.append((distance, interval_start, interval_end))
        if candidates:
            _, interval_start, interval_end = min(candidates, key=lambda item: item[0])
            return max(0, round((interval_end - interval_start).total_seconds()))
    return 0


def list_operation_activity_paginated(
    account_id: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """先筛选、分页业务操作，再仅为当前页计算使用时长。"""
    from app.services import account_service, operation_log_service

    accounts = account_service.list_accounts()
    account_by_name = {
        name: account
        for account in accounts
        for name in (account.owner, account.username)
        if name
    }
    start, end = _local_bounds(date_from, date_to)
    normalized_keyword = keyword.lower() if keyword else ""
    filtered: list[tuple[Any, Any]] = []
    for log in operation_log_service.list_logs(source=source):
        account = account_by_name.get(log.operator)
        if account_id and (not account or account.id != account_id):
            continue
        if start and log.created_at < start:
            continue
        if end and log.created_at > end:
            continue
        if normalized_keyword and normalized_keyword not in f"{log.operator} {log.section} {log.content}".lower():
            continue
        filtered.append((log, account))

    result = paginate(filtered, page, page_size)
    current_rows = result["items"]
    relevant_accounts = {
        (account.id, log.source)
        for log, account in current_rows
        if account
    }
    indexes = _usage_interval_indexes(relevant_accounts)
    result["items"] = [
        {
            "id": f"operation-{log.id}",
            "event_type": "operation",
            "account_id": account.id if account else "",
            "username": account.username if account else "",
            "owner": log.operator,
            "role": log.operator_role,
            "source": log.source,
            "ip": log.ip,
            "device_info": "",
            "page_path": log.path,
            "page_name": log.section,
            "content": log.content,
            "method": log.method,
            "created_at": log.created_at.isoformat(),
            "duration_seconds": _activity_page_duration(
                indexes,
                account.id if account else "",
                log.source,
                log.created_at,
                log.path,
                log.section,
            ),
            "ended_at": None,
        }
        for log, account in current_rows
    ]
    return result


def get_account_summary() -> list[dict[str, Any]]:
    from app.services import account_service, operation_log_service

    now_local = datetime.now(CHINA_TZ)
    records = _records()
    login_records = [item for item in records if item.event_type == "login"]
    page_view_records = [item for item in records if item.event_type == "page_view"]
    usage_sessions = _usage_sessions()
    today_start = datetime.combine(now_local.date(), time.min, tzinfo=CHINA_TZ).astimezone(timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    month_start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start_local.month == 12:
        next_month_local = month_start_local.replace(year=month_start_local.year + 1, month=1)
    else:
        next_month_local = month_start_local.replace(month=month_start_local.month + 1)
    month_start = month_start_local.astimezone(timezone.utc)
    next_month = next_month_local.astimezone(timezone.utc)
    now_utc = datetime.now(timezone.utc)
    accounts = account_service.list_accounts()
    account_by_name = {
        name: account
        for account in accounts
        for name in (account.owner, account.username)
        if name
    }
    activity_events_by_source: dict[tuple[str, str], list[tuple[datetime, str]]] = {}
    for record in page_view_records:
        if record.source in {"pc", "miniprogram"}:
            activity_events_by_source.setdefault((record.account_id, record.source), []).append(
                (record.created_at, record.ip)
            )
    for log in operation_log_service.list_logs():
        account = account_by_name.get(log.operator)
        if account and log.source in {"pc", "miniprogram"}:
            activity_events_by_source.setdefault((account.id, log.source), []).append(
                (log.created_at, log.ip)
            )

    result = []
    for account in accounts:
        account_logins = [item for item in login_records if item.account_id == account.id]
        today_logins = [item for item in account_logins if item.created_at.astimezone(CHINA_TZ).date() == now_local.date()]
        month_logins = [
            item for item in account_logins
            if (item.created_at.astimezone(CHINA_TZ).year, item.created_at.astimezone(CHINA_TZ).month)
            == (now_local.year, now_local.month)
        ]
        latest = max(account_logins, key=lambda item: item.created_at, default=None)
        account_usage = [session for session in usage_sessions if session.account_id == account.id]
        usage_intervals = [
            (start_at, end_at)
            for session in account_usage
            for start_at, end_at, _, _ in _effective_intervals(session, now_utc)
        ]
        source_metrics: dict[str, dict[str, Any]] = {}
        for source in ("pc", "miniprogram"):
            source_logins = [item for item in account_logins if item.source == source]
            source_today_logins = [item for item in today_logins if item.source == source]
            source_month_logins = [item for item in month_logins if item.source == source]
            source_activity_events = activity_events_by_source.get((account.id, source), [])
            source_activity_times = [activity_at for activity_at, _ in source_activity_events]
            login_days = {item.created_at.astimezone(CHINA_TZ).date() for item in source_logins}
            fallback_days = {
                activity_at.astimezone(CHINA_TZ).date()
                for activity_at in source_activity_times
            } - login_days
            fallback_intervals = _fallback_activity_intervals(source_activity_times, now_utc)
            source_usage_intervals = [
                (start_at, end_at)
                for session in account_usage
                if session.source == source
                for start_at, end_at, _, _ in _effective_intervals(session, now_utc)
            ] + fallback_intervals
            usage_intervals.extend(fallback_intervals)
            latest_active = max(
                [(item.created_at, item.ip) for item in source_logins]
                + source_activity_events
                + [
                    (session.last_heartbeat_at, session.ip)
                    for session in account_usage
                    if session.source == source
                ],
                key=lambda event: event[0],
                default=None,
            )
            source_metrics[source] = {
                "today_count": len(source_today_logins) + int(now_local.date() in fallback_days),
                "month_count": len(source_month_logins) + sum(
                    (day.year, day.month) == (now_local.year, now_local.month)
                    for day in fallback_days
                ),
                "today_usage_seconds": _merged_duration(
                    source_usage_intervals,
                    today_start,
                    tomorrow_start,
                ),
                "month_usage_seconds": _merged_duration(
                    source_usage_intervals,
                    month_start,
                    next_month,
                ),
                "latest_active_at": latest_active[0] if latest_active else None,
                "latest_active_ip": latest_active[1] if latest_active else "",
            }
        account_activity_times = [
            activity_at
            for source in ("pc", "miniprogram")
            for activity_at, _ in activity_events_by_source.get((account.id, source), [])
        ]
        last_active = max(
            [session.last_heartbeat_at for session in account_usage] + account_activity_times,
            default=None,
        )
        today_count = sum(metrics["today_count"] for metrics in source_metrics.values())
        month_count = sum(metrics["month_count"] for metrics in source_metrics.values())
        result.append({
            "account_id": account.id,
            "username": account.username,
            "owner": account.owner,
            "role": account.role,
            "today_count": today_count,
            "month_count": month_count,
            "latest_login_at": latest.created_at if latest else None,
            "latest_ip": latest.ip if latest else "",
            "latest_source": latest.source if latest else "",
            "today_usage_seconds": _merged_duration(usage_intervals, today_start, tomorrow_start),
            "month_usage_seconds": _merged_duration(usage_intervals, month_start, next_month),
            "pc_today_count": source_metrics["pc"]["today_count"],
            "pc_month_count": source_metrics["pc"]["month_count"],
            "pc_today_usage_seconds": source_metrics["pc"]["today_usage_seconds"],
            "pc_month_usage_seconds": source_metrics["pc"]["month_usage_seconds"],
            "pc_latest_active_at": source_metrics["pc"]["latest_active_at"],
            "pc_latest_active_ip": source_metrics["pc"]["latest_active_ip"],
            "miniprogram_today_count": source_metrics["miniprogram"]["today_count"],
            "miniprogram_month_count": source_metrics["miniprogram"]["month_count"],
            "miniprogram_today_usage_seconds": source_metrics["miniprogram"]["today_usage_seconds"],
            "miniprogram_month_usage_seconds": source_metrics["miniprogram"]["month_usage_seconds"],
            "miniprogram_latest_active_at": source_metrics["miniprogram"]["latest_active_at"],
            "miniprogram_latest_active_ip": source_metrics["miniprogram"]["latest_active_ip"],
            "last_active_at": last_active,
        })
    return sorted(result, key=lambda item: (item["month_count"], item["today_count"], item["owner"]), reverse=True)


def list_activity(
    account_id: str | None = None,
    event_type: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    keyword: str | None = None,
) -> list[dict[str, Any]]:
    from app.services import account_service, operation_log_service

    accounts = account_service.list_accounts()
    account_by_name = {
        name: account
        for account in accounts
        for name in (account.owner, account.username)
        if name
    }
    start, end = _local_bounds(date_from, date_to)
    now_utc = datetime.now(timezone.utc)
    usage_indexes = _usage_interval_indexes(now=now_utc)

    items: list[dict[str, Any]] = []
    if event_type in (None, "", "login", "page_view"):
        for record in _records():
            if event_type and record.event_type != event_type:
                continue
            if account_id and record.account_id != account_id:
                continue
            if source and record.source != source:
                continue
            if start and record.created_at < start:
                continue
            if end and record.created_at > end:
                continue
            content = "登录系统" if record.event_type == "login" else f"访问{record.page_name}"
            if keyword and keyword.lower() not in f"{record.owner} {record.username} {record.page_name} {content}".lower():
                continue
            items.append({
                **record.model_dump(mode="json"),
                "content": content,
                "method": "",
                "duration_seconds": (
                    _activity_page_duration(
                        usage_indexes,
                        record.account_id,
                        record.source,
                        record.created_at,
                        record.page_path,
                        record.page_name,
                    )
                    if record.event_type == "page_view"
                    else 0
                ),
                "ended_at": None,
            })

    # 默认明细已把页面时长合并到访问、操作记录中；仅主动筛选时长时返回原始区间。
    if event_type == "usage":
        for session in _usage_sessions():
            if account_id and session.account_id != account_id:
                continue
            if source and session.source != source:
                continue
            for index, (interval_start, interval_end, page_path, page_name) in enumerate(_effective_intervals(session, now_utc)):
                clipped_start = max(interval_start, start) if start else interval_start
                clipped_end = min(interval_end, end) if end else interval_end
                if clipped_end <= clipped_start:
                    continue
                duration_seconds = round((clipped_end - clipped_start).total_seconds())
                content = f"使用{page_name}"
                if keyword and keyword.lower() not in f"{session.owner} {session.username} {page_name} {content}".lower():
                    continue
                items.append({
                    "id": f"usage-{session.id}-{index}",
                    "event_type": "usage",
                    "account_id": session.account_id,
                    "username": session.username,
                    "owner": session.owner,
                    "role": session.role,
                    "source": session.source,
                    "ip": session.ip,
                    "device_info": session.device_info,
                    "page_path": page_path,
                    "page_name": page_name,
                    "content": content,
                    "method": "",
                    "duration_seconds": duration_seconds,
                    "created_at": clipped_start.isoformat(),
                    "ended_at": clipped_end.isoformat(),
                })

    if event_type in (None, "", "operation"):
        for log in operation_log_service.list_logs(source=source):
            account = account_by_name.get(log.operator)
            if account_id and (not account or account.id != account_id):
                continue
            if start and log.created_at < start:
                continue
            if end and log.created_at > end:
                continue
            if keyword and keyword.lower() not in f"{log.operator} {log.section} {log.content}".lower():
                continue
            items.append({
                "id": f"operation-{log.id}",
                "event_type": "operation",
                "account_id": account.id if account else "",
                "username": account.username if account else "",
                "owner": log.operator,
                "role": log.operator_role,
                "source": log.source,
                "ip": log.ip,
                "device_info": "",
                "page_path": log.path,
                "page_name": log.section,
                "content": log.content,
                "method": log.method,
                "created_at": log.created_at.isoformat(),
                "duration_seconds": _activity_page_duration(
                    usage_indexes,
                    account.id if account else "",
                    log.source,
                    log.created_at,
                    log.path,
                    log.section,
                ),
                "ended_at": None,
            })

    return sorted(items, key=lambda item: item["created_at"], reverse=True)
