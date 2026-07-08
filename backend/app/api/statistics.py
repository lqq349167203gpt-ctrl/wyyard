"""统计 API — 邀约到访 / 实际到访 / 成交人数"""
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
from app.api.customer_detail import _build_activities, _build_payment_records

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


def _get_customer_stats(customer_id: str, date_from: str | None = None, date_to: str | None = None) -> dict:
    """获取客户统计：受邀次数、到店次数、参与活动次数、消费总额（与详情页一致）"""
    c = customer_service.get_customer(customer_id)
    if not c:
        return {"invited_count": 0, "visit_count": 0, "activity_count": 0, "total_consumption": 0.0, "visit_interval": "-"}

    # 所有邀约记录
    all_visits = visit_service.list_visits(customer_id=customer_id)
    if date_from and date_to:
        range_visits = [v for v in all_visits if v.visit_date and date_from <= v.visit_date <= date_to]
    else:
        range_visits = list(all_visits)
    invited_count = len(range_visits)

    # 到店次数：按日期范围过滤
    arrived_visits = [v for v in range_visits if v.arrived]
    visit_count = len(arrived_visits)

    # 参与活动次数：使用详情页相同的 _build_activities 逻辑（必须实际到店）
    arrived_dates = {v.visit_date for v in arrived_visits}
    activities = _build_activities(customer_id, arrived_dates)
    activity_count = len(activities)

    # 消费总额：使用详情页相同的 _build_payment_records 逻辑（排除已作废）
    payment_records = _build_payment_records(customer_id)
    if date_from and date_to:
        payment_records = [r for r in payment_records if r.get("effective_date") and date_from <= r["effective_date"] <= date_to]
    total_consumption = sum(r["amount"] for r in payment_records if not r.get("voided", False))

    # 到店间隔：(今天 - 第一次到店日期) / 到店次数
    visit_interval = "-"
    if visit_count > 0 and arrived_dates:
        first_visit_date = min(arrived_dates)
        days_since_first = (datetime.now() - datetime.strptime(first_visit_date, "%Y-%m-%d")).days
        visit_interval = f"{round(days_since_first / visit_count)}天"

    return {
        "invited_count": invited_count,
        "visit_count": visit_count,
        "activity_count": activity_count,
        "total_consumption": round(total_consumption, 2),
        "visit_interval": visit_interval,
    }


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
                **data.get(date_str, {"invited": 0, "arrived": 0, "converted": 0, "converted_amount": 0.0}),
            })
            current += timedelta(days=1)
        return result

    # 按周或月聚合
    grouped: dict[str, dict] = defaultdict(lambda: {"invited": 0, "arrived": 0, "converted": 0, "converted_amount": 0.0})
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
        grouped[key]["converted_amount"] += values.get("converted_amount", 0)

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
    daily: dict[str, dict] = defaultdict(lambda: {"invited": 0, "arrived": 0, "converted": 0, "converted_amount": 0.0})

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

    # 3. 成交金额（按 deal_date 累加，排除已作废）
    def _get_amount(r):
        return getattr(r, "fee", None) or getattr(r, "price", None) or getattr(r, "amount", None) or 0

    for records in services:
        for r in records:
            deal_date = getattr(r, "deal_date", None)
            price = _get_amount(r)
            voided = getattr(r, "voided", False)
            if deal_date and not voided and date_from <= deal_date <= date_to:
                daily[deal_date]["converted_amount"] += price

    data = _aggregate_by_granularity(daily, granularity, date_from, date_to)
    return {"data": data}


@router.get("/details")
def get_details(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    status: str = Query(None, description="状态筛选: invited/arrived/converted"),
    total: bool = Query(False, description="是否统计总数据（不限日期范围）"),
):
    date_from, date_to = _get_date_range(date_from, date_to)

    # 1. 先构建成交人员集合（用于标记邀约/到访记录的成交状态）
    customers_map = {c.id: c for c in customer_service.list_customers()}
    TYPE_LABELS = {
        "membership-cards": "会员卡",
        "group-cases": "觉醒游戏",
        "emotional-releases": "情绪释放",
        "energy-knots": "能量结",
        "internal-courses": "内部课程",
        "oh-card-readings": "OH卡解读",
        "other-projects": "其他项目",
    }
    services = [
        ("membership-cards", membership_card_service.list_cards()),
        ("group-cases", group_case_service.list_cases()),
        ("emotional-releases", emotional_release_service.list_releases()),
        ("energy-knots", energy_knot_service.list_knots()),
        ("internal-courses", internal_course_service.list_courses()),
        ("oh-card-readings", oh_card_reading_service.list_readings()),
        ("other-projects", other_project_service.list_projects()),
    ]
    # 收集范围内有成交的客户 ID 及其成交类型
    converted_customer_ids: set[str] = set()
    for type_name, records in services:
        for r in records:
            deal_date = getattr(r, "deal_date", None)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and customer_id and date_from <= deal_date <= date_to:
                converted_customer_ids.add(customer_id)

    # 2. 获取邀约到访人员（排除无客户关联的记录）
    invited_list = []
    arrived_list = []
    visits = visit_service.list_visits()
    # nickname 缓存：customer_id → nickname，避免重复查库
    _nick_cache: dict[str, str] = {}
    for v in visits:
        visit_date = v.visit_date
        cid = v.customer_id or ""
        if not cid:
            continue
        # 从 customer_id 反查 nickname
        if cid not in _nick_cache:
            c = customers_map.get(cid) or customer_service.get_customer(cid)
            _nick_cache[cid] = c.nickname if c else cid
        nick = _nick_cache[cid]
        if visit_date and date_from <= visit_date <= date_to:
            # 如果该客户在时间范围内有成交，状态标记为已成交
            is_converted = cid in converted_customer_ids
            invited_list.append({
                "customer_id": cid,
                "nickname": nick,
                "date": visit_date,
                "status": "converted" if is_converted else "invited",
                "arrived": v.arrived,
                "member_type": v.member_type or "",
            })
            if v.arrived:
                arrived_list.append({
                    "customer_id": cid,
                    "nickname": nick,
                    "date": visit_date,
                    "status": "converted" if is_converted else "arrived",
                    "arrived": True,
                    "member_type": v.member_type or "",
                })

    # 3. 获取成交人员
    converted_list = []
    for type_name, records in services:
        for r in records:
            deal_date = getattr(r, "deal_date", None)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and customer_id and date_from <= deal_date <= date_to:
                c = customers_map.get(customer_id)
                # 按类型取项目名称
                if type_name == "membership-cards":
                    name = r.card_type
                elif type_name == "other-projects":
                    name = r.project_name
                elif type_name == "internal-courses":
                    name = r.course_type
                else:
                    name = ""
                # 按类型取购买次数
                if type_name == "membership-cards":
                    quantity = "不限" if r.total_count is None else r.total_count
                elif type_name == "other-projects":
                    quantity = "不限" if r.total_count is None else r.total_count
                elif type_name in ("group-cases", "emotional-releases", "energy-knots", "oh-card-readings"):
                    quantity = r.purchase_count
                else:
                    quantity = ""
                converted_list.append({
                    "customer_id": customer_id,
                    "nickname": c.nickname if c else "",
                    "date": deal_date,
                    "status": "converted",
                    "type": TYPE_LABELS.get(type_name, type_name),
                    "name": name,
                    "quantity": quantity,
                    "member_type": c.member_type if c and c.member_type else "",
                    "amount": getattr(r, "fee", None) or getattr(r, "price", None) or getattr(r, "amount", None) or 0,
                })

    # 补充客户统计信息
    all_records = invited_list + arrived_list + converted_list
    unique_ids = {r["customer_id"] for r in all_records if r.get("customer_id")}
    # total=True 时统计不限日期范围，否则按选定日期范围统计
    stats_from = None if total else date_from
    stats_to = None if total else date_to
    stats_map = {cid: _get_customer_stats(cid, stats_from, stats_to) for cid in unique_ids}

    for r in all_records:
        stats = stats_map.get(r.get("customer_id", ""), {})
        r["invited_count"] = stats.get("invited_count", 0)
        r["visit_count"] = stats.get("visit_count", 0)
        r["activity_count"] = stats.get("activity_count", 0)
        r["total_consumption"] = stats.get("total_consumption", 0)
        r["visit_interval"] = stats.get("visit_interval", "-")

    # 成交记录：activity_count 改为当天活动次数（与弹窗一致）
    _daily_activity_cache: dict[str, list] = {}
    for r in converted_list:
        cid = r.get("customer_id", "")
        deal_date = r.get("date", "")
        if not cid or not deal_date:
            continue
        cache_key = f"{cid}|{deal_date}"
        if cache_key not in _daily_activity_cache:
            _daily_activity_cache[cache_key] = _build_activities(cid, {deal_date})
        r["activity_count"] = len(_daily_activity_cache[cache_key])

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
