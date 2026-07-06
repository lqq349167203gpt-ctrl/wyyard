"""统计 API — 邀约到访 / 实际到访 / 成交人数 / 数据分析"""
import math
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import APIRouter, Query
from app.services import (
    visit_service,
    customer_service,
    membership_card_service,
    group_case_service,
    emotional_release_service,
    energy_knot_service,
    internal_course_service,
    oh_card_reading_service,
    other_project_service,
)

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


def _get_date_range(date_from: str | None, date_to: str | None):
    """获取日期范围，默认最近30天"""
    today = datetime.now().strftime("%Y-%m-%d")
    if not date_to:
        date_to = today
    if not date_from:
        date_from = (datetime.strptime(date_to, "%Y-%m-%d") - timedelta(days=29)).strftime("%Y-%m-%d")
    return date_from, date_to


def _aggregate_by_granularity(data: dict[str, dict], granularity: str, date_from: str, date_to: str):
    """按粒度聚合数据"""
    if granularity == "day":
        # 按天直接返回
        result = []
        current = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d")
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            result.append({
                "date": date_str,
                **data.get(date_str, {"invited": 0, "arrived": 0, "converted": 0}),
            })
            current += timedelta(days=1)
        return result

    # 按周或月聚合
    grouped: dict[str, dict] = defaultdict(lambda: {"invited": 0, "arrived": 0, "converted": 0})
    for date_str, values in data.items():
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        if granularity == "week":
            # ISO 周：YYYY-Www
            key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
        else:
            # 月：YYYY-MM
            key = dt.strftime("%Y-%m")
        grouped[key]["invited"] += values["invited"]
        grouped[key]["arrived"] += values["arrived"]
        grouped[key]["converted"] += values["converted"]

    result = []
    current = datetime.strptime(date_from, "%Y-%m-%d")
    end = datetime.strptime(date_to, "%Y-%m-%d")
    seen = set()
    while current <= end:
        if granularity == "week":
            key = f"{current.isocalendar()[0]}-W{current.isocalendar()[1]:02d}"
        else:
            key = current.strftime("%Y-%m")
        if key not in seen:
            seen.add(key)
            result.append({"date": key, **grouped[key]})
        if granularity == "week":
            current += timedelta(days=7 - current.weekday())  # 下周一
        else:
            # 下个月1号
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    return result


@router.get("/overview")
def get_overview(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    granularity: str = Query("day", description="聚合粒度: day/week/month"),
):
    date_from, date_to = _get_date_range(date_from, date_to)

    # 按日期聚合数据
    daily: dict[str, dict] = defaultdict(lambda: {"invited": 0, "arrived": 0, "converted": 0})

    # 1. 邀约到访 / 实际到访
    visits = visit_service.list_visits()
    for v in visits:
        visit_date = v.visit_date
        if visit_date and date_from <= visit_date <= date_to:
            daily[visit_date]["invited"] += 1
            if v.arrived:
                daily[visit_date]["arrived"] += 1

    # 2. 成交人数（按 deal_date 去重客户）
    converted_by_date: dict[str, set] = defaultdict(set)
    services = [
        membership_card_service.list_cards(),
        group_case_service.list_cases(),
        emotional_release_service.list_releases(),
        energy_knot_service.list_knots(),
        internal_course_service.list_courses(),
        oh_card_reading_service.list_readings(),
        other_project_service.list_projects(),
    ]
    for records in services:
        for r in records:
            deal_date = getattr(r, "deal_date", None)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and customer_id and date_from <= deal_date <= date_to:
                converted_by_date[deal_date].add(customer_id)

    for date_str, customer_ids in converted_by_date.items():
        daily[date_str]["converted"] = len(customer_ids)

    data = _aggregate_by_granularity(daily, granularity, date_from, date_to)
    return {"data": data}


@router.get("/details")
def get_details(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    status: str = Query(None, description="状态筛选: invited/arrived/converted"),
):
    date_from, date_to = _get_date_range(date_from, date_to)

    # 1. 获取邀约到访人员
    invited_list = []
    arrived_list = []
    visits = visit_service.list_visits()
    for v in visits:
        visit_date = v.visit_date
        if visit_date and date_from <= visit_date <= date_to:
            invited_list.append({
                "nickname": v.nickname,
                "date": visit_date,
                "status": "invited",
                "arrived": v.arrived,
            })
            if v.arrived:
                arrived_list.append({
                    "nickname": v.nickname,
                    "date": visit_date,
                    "status": "arrived",
                })

    # 2. 获取成交人员
    converted_list = []
    services = [
        ("membership-cards", membership_card_service.list_cards()),
        ("group-cases", group_case_service.list_cases()),
        ("emotional-releases", emotional_release_service.list_releases()),
        ("energy-knots", energy_knot_service.list_knots()),
        ("internal-courses", internal_course_service.list_courses()),
        ("oh-card-readings", oh_card_reading_service.list_readings()),
        ("other-projects", other_project_service.list_projects()),
    ]
    for type_name, records in services:
        for r in records:
            deal_date = getattr(r, "deal_date", None)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and customer_id and date_from <= deal_date <= date_to:
                converted_list.append({
                    "customer_id": customer_id,
                    "date": deal_date,
                    "status": "converted",
                    "type": type_name,
                })

    # 根据状态筛选
    if status == "invited":
        return {"data": invited_list}
    elif status == "arrived":
        return {"data": arrived_list}
    elif status == "converted":
        return {"data": converted_list}
    else:
        return {
            "invited": invited_list,
            "arrived": arrived_list,
            "converted": converted_list,
        }


WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def _get_daily_metric(metric: str, date_from: str, date_to: str) -> dict[str, float]:
    """按天聚合指定指标，返回 {日期: 数值}"""
    daily: dict[str, float] = defaultdict(float)

    if metric in ("invited", "arrived"):
        visits = visit_service.list_visits()
        for v in visits:
            visit_date = v.visit_date
            if visit_date and date_from <= visit_date <= date_to:
                if metric == "invited":
                    daily[visit_date] += 1
                elif v.arrived:
                    daily[visit_date] += 1
    elif metric == "converted":
        converted_by_date: dict[str, set] = defaultdict(set)
        services = [
            membership_card_service.list_cards(),
            group_case_service.list_cases(),
            emotional_release_service.list_releases(),
            energy_knot_service.list_knots(),
            internal_course_service.list_courses(),
            oh_card_reading_service.list_readings(),
            other_project_service.list_projects(),
        ]
        for records in services:
            for r in records:
                deal_date = getattr(r, "deal_date", None)
                customer_id = getattr(r, "customer_id", None)
                if deal_date and customer_id and date_from <= deal_date <= date_to:
                    converted_by_date[deal_date].add(customer_id)
        for date_str, customer_ids in converted_by_date.items():
            daily[date_str] = len(customer_ids)

    return dict(daily)


@router.get("/analysis")
def get_analysis(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    granularity: str = Query("month", description="基准粒度: month/year"),
    metric: str = Query("arrived", description="分析指标: invited/arrived/converted"),
):
    date_from, date_to = _get_date_range(date_from, date_to)
    daily = _get_daily_metric(metric, date_from, date_to)

    # 构建完整日期序列
    current = datetime.strptime(date_from, "%Y-%m-%d")
    end = datetime.strptime(date_to, "%Y-%m-%d")
    all_dates = []
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        all_dates.append(date_str)
        current += timedelta(days=1)

    # 按天的数据
    values = [daily.get(d, 0) for d in all_dates]

    # 计算基准值（月均值或年均值）
    if granularity == "year":
        # 按年：同一年的所有天的均值
        year_groups: dict[int, list[float]] = defaultdict(list)
        for i, d in enumerate(all_dates):
            year_groups[int(d.split("-")[0])].append(values[i])
        benchmark_map: dict[str, float] = {}
        for year, vals in year_groups.items():
            avg = sum(vals) / len(vals) if vals else 0
            for d in all_dates:
                if int(d.split("-")[0]) == year:
                    benchmark_map[d] = avg
    else:
        # 按月：同一月的所有天的均值
        month_groups: dict[str, list[float]] = defaultdict(list)
        for i, d in enumerate(all_dates):
            month_groups[d[:7]].append(values[i])
        benchmark_map = {}
        for month, vals in month_groups.items():
            avg = sum(vals) / len(vals) if vals else 0
            for d in all_dates:
                if d[:7] == month:
                    benchmark_map[d] = avg

    # 计算标准差（基于偏差）
    benchmark_val = sum(values) / len(values) if values else 0
    deviations = [v - benchmark_map.get(d, benchmark_val) for v, d in zip(values, all_dates)]
    variance = sum(d * d for d in deviations) / len(deviations) if deviations else 0
    std_dev = math.sqrt(variance)

    # 异常阈值
    threshold = 1.5 * std_dev

    # 计算趋势（近 7 天移动平均斜率）
    trend = "平稳"
    if len(values) >= 7:
        recent = values[-7:]
        first_half = sum(recent[:3]) / 3
        second_half = sum(recent[4:]) / 3
        diff = second_half - first_half
        if diff > std_dev * 0.3:
            trend = "上升"
        elif diff < -std_dev * 0.3:
            trend = "下降"

    # 构建每日数据
    data = []
    anomaly_count = 0
    for i, d in enumerate(all_dates):
        bm = benchmark_map.get(d, benchmark_val)
        dev = values[i] - bm
        is_anomaly = abs(dev) > threshold
        if is_anomaly:
            anomaly_count += 1
        data.append({
            "date": d,
            "value": values[i],
            "benchmark": round(bm, 1),
            "deviation": round(dev, 1),
            "deviation_rate": round((dev / bm * 100), 1) if bm > 0 else 0,
            "is_anomaly": is_anomaly,
        })

    # 星期分析
    weekday_values: dict[int, list[float]] = defaultdict(list)
    for i, d in enumerate(all_dates):
        dt = datetime.strptime(d, "%Y-%m-%d")
        weekday_values[dt.weekday()].append(values[i])

    weekday_stats = []
    for wd in range(7):
        vals = weekday_values.get(wd, [])
        weekday_stats.append({
            "weekday": wd,
            "label": WEEKDAY_LABELS[wd],
            "avg": round(sum(vals) / len(vals), 1) if vals else 0,
            "count": len(vals),
        })

    return {
        "data": data,
        "benchmark": round(benchmark_val, 1),
        "std_dev": round(std_dev, 1),
        "anomaly_threshold": {
            "upper": round(benchmark_val + threshold, 1),
            "lower": round(max(0, benchmark_val - threshold), 1),
        },
        "anomaly_count": anomaly_count,
        "trend": trend,
        "weekday_stats": weekday_stats,
    }


@router.get("/frequent-visitors")
def get_frequent_visitors(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    limit: int = Query(20, description="返回数量"),
):
    date_from, date_to = _get_date_range(date_from, date_to)

    # 统计每个客户的到场次数和最后到场日期
    visit_counts: dict[str, int] = defaultdict(int)
    last_visits: dict[str, str] = {}

    visits = visit_service.list_visits()
    for v in visits:
        if v.arrived and v.visit_date and date_from <= v.visit_date <= date_to:
            cid = v.customer_id
            if cid:
                visit_counts[cid] += 1
                if cid not in last_visits or v.visit_date > last_visits[cid]:
                    last_visits[cid] = v.visit_date

    # 按次数排序
    sorted_visitors = sorted(visit_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

    # 关联客户数据
    customers_map = {c.id: c for c in customer_service.list_customers()}

    visitors = []
    for cid, count in sorted_visitors:
        c = customers_map.get(cid)
        if not c:
            continue
        products = [p.type.value if hasattr(p.type, "value") else str(p.type) for p in (c.paid_content or [])]
        tags_parts = []
        if c.tags:
            tags_parts.append(c.tags)
        if c.need_tags:
            tags_parts.append(c.need_tags)
        visitors.append({
            "customer_id": cid,
            "nickname": c.nickname or "-",
            "member_type": c.member_type or "",
            "visit_count": count,
            "is_new": not bool(c.member_type),
            "products": products,
            "tags": ",".join(tags_parts) if tags_parts else "",
            "last_visit": last_visits.get(cid, ""),
        })

    return {"visitors": visitors}


@router.get("/churned-visitors")
def get_churned_visitors(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    inactive_days: int = Query(30, description="流失天数阈值"),
):
    date_from, date_to = _get_date_range(date_from, date_to)
    today = datetime.now().strftime("%Y-%m-%d")
    cutoff = (datetime.now() - timedelta(days=inactive_days)).strftime("%Y-%m-%d")

    # 统计历史总到场次数和最后到场日期（不限于 date_from~date_to）
    visit_counts: dict[str, int] = defaultdict(int)
    last_visits: dict[str, str] = {}

    visits = visit_service.list_visits()
    for v in visits:
        if v.arrived and v.visit_date:
            cid = v.customer_id
            if cid:
                visit_counts[cid] += 1
                if cid not in last_visits or v.visit_date > last_visits[cid]:
                    last_visits[cid] = v.visit_date

    # 找出曾经高频（>=3次）且最近未到场的客户
    customers_map = {c.id: c for c in customer_service.list_customers()}
    churned = []

    for cid, count in visit_counts.items():
        if count < 3:
            continue
        last = last_visits.get(cid, "")
        if not last or last >= cutoff:
            continue
        c = customers_map.get(cid)
        if not c:
            continue
        days_inactive = (datetime.now() - datetime.strptime(last, "%Y-%m-%d")).days
        products = [p.type.value if hasattr(p.type, "value") else str(p.type) for p in (c.paid_content or [])]
        tags_parts = []
        if c.tags:
            tags_parts.append(c.tags)
        if c.need_tags:
            tags_parts.append(c.need_tags)
        churned.append({
            "customer_id": cid,
            "nickname": c.nickname or "-",
            "total_visits": count,
            "last_visit": last,
            "days_inactive": days_inactive,
            "products": products,
            "tags": ",".join(tags_parts) if tags_parts else "",
        })

    churned.sort(key=lambda x: x["last_visit"])
    return {"visitors": churned}
