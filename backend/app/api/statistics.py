"""统计 API — 客户经营指标 / 邀约到访 / 实际到访 / 成交人数 / 会员情况"""
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Query

from app.api.customer_detail import _build_activities, _build_payment_records
from app.services import (
    customer_service,
    emotional_release_service,
    energy_knot_service,
    group_case_service,
    internal_course_service,
    member_identity_service,
    membership_card_service,
    oh_card_reading_service,
    other_project_service,
    visit_service,
)

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


def _get_record_date(r) -> str | None:
    """获取记录的有效日期：优先 deal_date，回退到 created_at"""
    deal_date = getattr(r, "deal_date", None)
    if deal_date:
        return deal_date
    created_at = getattr(r, "created_at", None)
    if created_at:
        if isinstance(created_at, datetime):
            return created_at.strftime("%Y-%m-%d")
        return str(created_at)[:10]
    return None


def _get_record_amount(record) -> float:
    """统一读取各付费项目的成交金额。"""
    return float(
        getattr(record, "fee", None)
        or getattr(record, "price", None)
        or getattr(record, "amount", None)
        or 0
    )


def _payment_record_groups() -> list[list]:
    """返回所有会产生成交记录的项目数据。"""
    return [
        membership_card_service.list_cards(),
        group_case_service.list_cases(),
        emotional_release_service.list_releases(),
        energy_knot_service.list_knots(),
        internal_course_service.list_courses(),
        oh_card_reading_service.list_readings(),
        other_project_service.list_projects(),
    ]


def _build_dashboard_summary(today: date) -> dict:
    """构建客户资料页经营指标，日期均按自然月统计。"""
    current_start = today.replace(day=1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end.replace(day=1)

    current_from = current_start.isoformat()
    current_to = today.isoformat()
    previous_from = previous_start.isoformat()
    previous_to = previous_end.isoformat()

    customers = customer_service.list_customers()
    new_customers = sum(
        1
        for customer in customers
        if current_from <= customer.created_at.date().isoformat() <= current_to
    )

    current_arrivals = len(visit_service.get_arrived_customer_ids(current_from, current_to))
    previous_arrivals = len(visit_service.get_arrived_customer_ids(previous_from, previous_to))
    arrival_change_rate = None
    if previous_arrivals > 0:
        arrival_change_rate = round((current_arrivals - previous_arrivals) / previous_arrivals * 100, 1)

    monthly_revenue = 0.0
    monthly_transactions = 0
    for records in _payment_record_groups():
        for record in records:
            record_date = _get_record_date(record)
            if (
                record_date
                and current_from <= record_date <= current_to
                and not getattr(record, "voided", False)
            ):
                monthly_revenue += _get_record_amount(record)
                monthly_transactions += 1

    not_arrived_days = 14
    recent_arrival_from = (today - timedelta(days=not_arrived_days)).isoformat()
    recently_arrived_ids = visit_service.get_arrived_customer_ids(recent_arrival_from, current_to)
    not_arrived_customers = sum(1 for customer in customers if customer.id not in recently_arrived_ids)

    return {
        "month": current_start.strftime("%Y-%m"),
        "total_customers": len(customers),
        "new_customers_this_month": new_customers,
        "arrived_customers_this_month": current_arrivals,
        "arrived_customers_last_month": previous_arrivals,
        "arrival_change_rate": arrival_change_rate,
        "revenue_this_month": round(monthly_revenue, 2),
        "transactions_this_month": monthly_transactions,
        "not_arrived_customers": not_arrived_customers,
        "not_arrived_days": not_arrived_days,
    }


@router.get("/dashboard")
def get_dashboard_summary():
    """获取客户资料页四项核心经营指标。"""
    return _build_dashboard_summary(date.today())


def _get_customer_stats(customer_id: str, date_from: str | None = None, date_to: str | None = None) -> dict:
    """获取客户统计：受邀次数、到店次数、参与活动次数、消费总额（与详情页一致）"""
    c = customer_service.get_customer(customer_id)
    if not c:
        return {"invited_count": 0, "visit_count": 0, "activity_count": 0, "total_consumption": 0.0, "visit_interval": "-", "first_visit_date": "-"}

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

    # 首次到店日期
    first_visit_date = "-"
    if arrived_dates:
        first_visit_date = min(arrived_dates)

    # 到店间隔：(今天 - 第一次到店日期) / 到店次数
    visit_interval = "-"
    if visit_count > 0 and arrived_dates:
        first_visit = min(arrived_dates)
        days_since_first = (datetime.now() - datetime.strptime(first_visit, "%Y-%m-%d")).days
        visit_interval = f"{round(days_since_first / visit_count)}天"

    return {
        "invited_count": invited_count,
        "visit_count": visit_count,
        "activity_count": activity_count,
        "total_consumption": round(total_consumption, 2),
        "visit_interval": visit_interval,
        "first_visit_date": first_visit_date,
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
    services = _payment_record_groups()
    for records in services:
        for r in records:
            deal_date = _get_record_date(r)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and customer_id and date_from <= deal_date <= date_to:
                converted_by_date[deal_date].add(customer_id)

    for date_str, customer_ids in converted_by_date.items():
        daily[date_str]["converted"] = len(customer_ids)

    # 3. 成交金额（按 deal_date 累加，排除已作废）
    for records in services:
        for r in records:
            deal_date = _get_record_date(r)
            price = _get_record_amount(r)
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
            deal_date = _get_record_date(r)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and customer_id and date_from <= deal_date <= date_to:
                converted_customer_ids.add(customer_id)

    # 2. 获取邀约到访人员（排除无客户关联的记录）
    invited_list = []
    arrived_list = []
    visits = visit_service.list_visits()
    # nickname 缓存：customer_id → nickname，避免重复查库
    _cust_cache: dict[str, object] = {}
    for v in visits:
        visit_date = v.visit_date
        cid = v.customer_id or ""
        if not cid:
            continue
        # 从 customer_id 反查客户信息
        if cid not in _cust_cache:
            c = customers_map.get(cid) or customer_service.get_customer(cid)
            _cust_cache[cid] = c
        c = _cust_cache[cid]
        nick = c.nickname if c else cid
        member_type = c.member_type if c and c.member_type else ""
        if visit_date and date_from <= visit_date <= date_to:
            # 如果该客户在时间范围内有成交，状态标记为已成交
            is_converted = cid in converted_customer_ids
            invited_list.append({
                "customer_id": cid,
                "nickname": nick,
                "date": visit_date,
                "status": "converted" if is_converted else "invited",
                "arrived": v.arrived,
                "member_type": member_type,
            })
            if v.arrived:
                arrived_list.append({
                    "customer_id": cid,
                    "nickname": nick,
                    "date": visit_date,
                    "status": "converted" if is_converted else "arrived",
                    "arrived": True,
                    "member_type": member_type,
                })

    # 3. 获取成交人员
    converted_list = []
    for type_name, records in services:
        for r in records:
            deal_date = _get_record_date(r)
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


PRODUCT_TYPE_MAP = {
    "membership-cards": "会员卡",
    "group-cases": "觉醒游戏",
    "emotional-releases": "情绪释放",
    "oh-card-readings": "OH卡梳理",
    "energy-knots": "能量结",
    "internal-courses": "内部课程",
    "other-projects": "其他项目",
}

CARD_TYPES = ["次卡", "体验会员", "月卡", "12次卡", "3月卡", "30次卡", "半年卡", "年卡"]
COURSE_TYPES = ["疗愈师课程：自爱力构建", "商业框架陪跑：自觉力提升", "落地赋能班：自洽力整合"]


@router.get("/products")
def get_products(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    product_type: str | None = Query(None, description="产品类型筛选"),
    name_filter: str | None = Query(None, description="子类型名称筛选（会员卡卡类型/内部课程课程类型/其他项目项目名称）"),
    granularity: str = Query("day", description="聚合粒度: day/week/month"),
):
    date_from, date_to = _get_date_range(date_from, date_to)

    def _get_amount(r):
        return getattr(r, "fee", None) or getattr(r, "price", None) or getattr(r, "amount", None) or 0

    services = [
        ("membership-cards", membership_card_service.list_cards()),
        ("group-cases", group_case_service.list_cases()),
        ("emotional-releases", emotional_release_service.list_releases()),
        ("oh-card-readings", oh_card_reading_service.list_readings()),
        ("energy-knots", energy_knot_service.list_knots()),
        ("internal-courses", internal_course_service.list_courses()),
        ("other-projects", other_project_service.list_projects()),
    ]

    # 按产品类型汇总金额
    type_amounts: dict[str, float] = {v: 0.0 for v in PRODUCT_TYPE_MAP.values()}
    total_amount = 0.0

    # 按产品类型汇总成交量
    type_counts: dict[str, int] = {v: 0 for v in PRODUCT_TYPE_MAP.values()}
    total_count = 0

    # 总购买次数（觉醒游戏、情绪释放、OH卡梳理 的 purchase_count 累加）
    total_purchase_count = 0

    # 按产品类型汇总成交人数（按 customer_id 去重）
    type_persons: dict[str, set[str]] = {v: set() for v in PRODUCT_TYPE_MAP.values()}
    all_persons: set[str] = set()

    # 按日期 + 产品类型汇总金额/成交量/成交人数（用于折线图）
    daily_amount_by_type: dict[str, dict[str, float]] = defaultdict(lambda: {v: 0.0 for v in PRODUCT_TYPE_MAP.values()})
    daily_count_by_type: dict[str, dict[str, int]] = defaultdict(lambda: {v: 0 for v in PRODUCT_TYPE_MAP.values()})
    daily_persons_by_type: dict[str, dict[str, set[str]]] = defaultdict(lambda: {v: set() for v in PRODUCT_TYPE_MAP.values()})

    # 按日期汇总成交（用于列表）
    daily_converted_amount: dict[str, float] = defaultdict(float)
    daily_converted_count: dict[str, int] = defaultdict(int)
    daily_converted_persons: dict[str, set[str]] = defaultdict(set)
    daily_purchase_count: dict[str, int] = defaultdict(int)

    # 会员卡类型细分（当选 product_type=会员卡 时）
    card_type_amounts: dict[str, float] = defaultdict(float)
    card_type_counts: dict[str, int] = defaultdict(int)
    card_type_persons: dict[str, set[str]] = defaultdict(set)
    daily_card_type_amount: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    daily_card_type_count: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    daily_card_type_persons: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    # 内部课程类型细分（当选 product_type=内部课程 时）
    course_type_amounts: dict[str, float] = defaultdict(float)
    course_type_counts: dict[str, int] = defaultdict(int)
    course_type_persons: dict[str, set[str]] = defaultdict(set)
    daily_course_type_amount: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    daily_course_type_count: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    daily_course_type_persons: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    # 其他项目类型细分（当选 product_type=其他项目 时，按 project_name 聚合）
    other_project_amounts: dict[str, float] = defaultdict(float)
    other_project_counts: dict[str, int] = defaultdict(int)
    other_project_persons: dict[str, set[str]] = defaultdict(set)
    daily_other_project_amount: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    daily_other_project_count: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    daily_other_project_persons: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    other_project_name_set: set[str] = set()

    for type_name, records in services:
        label = PRODUCT_TYPE_MAP[type_name]
        if product_type and product_type != "全部" and label != product_type:
            continue
        for r in records:
            deal_date = _get_record_date(r)
            customer_id = getattr(r, "customer_id", None)
            voided = getattr(r, "voided", False)
            if deal_date and not voided and date_from <= deal_date <= date_to:
                amount = _get_amount(r)

                # 判断是否应该计入 daily_table（项目名称筛选，仅其他项目）
                include_in_daily = True
                if name_filter and type_name == "other-projects":
                    if (getattr(r, "project_name", None) or "其他") != name_filter:
                        include_in_daily = False

                type_amounts[label] += amount
                total_amount += amount
                type_counts[label] += 1
                total_count += 1
                # 购买次数（觉醒游戏、情绪释放、OH卡梳理、能量结有 purchase_count 字段；其他项目用 total_count，null 记为 1）
                if type_name in ("group-cases", "emotional-releases", "oh-card-readings", "energy-knots"):
                    pc = getattr(r, "purchase_count", 0) or 0
                    total_purchase_count += pc
                    if include_in_daily:
                        daily_purchase_count[deal_date] += pc
                elif type_name == "other-projects":
                    pc = getattr(r, "total_count", None) or 1
                    total_purchase_count += pc
                    if include_in_daily:
                        daily_purchase_count[deal_date] += pc
                daily_amount_by_type[deal_date][label] += amount
                daily_count_by_type[deal_date][label] += 1
                if include_in_daily:
                    daily_converted_amount[deal_date] += amount
                    daily_converted_count[deal_date] += 1
                if customer_id:
                    type_persons[label].add(customer_id)
                    all_persons.add(customer_id)
                    daily_persons_by_type[deal_date][label].add(customer_id)
                    if include_in_daily:
                        daily_converted_persons[deal_date].add(customer_id)
                # 会员卡类型细分
                if type_name == "membership-cards":
                    ct = getattr(r, "card_type", None) or "其他"
                    card_type_amounts[ct] += amount
                    card_type_counts[ct] += 1
                    daily_card_type_amount[deal_date][ct] += amount
                    daily_card_type_count[deal_date][ct] += 1
                    if customer_id:
                        card_type_persons[ct].add(customer_id)
                        daily_card_type_persons[deal_date][ct].add(customer_id)
                # 内部课程类型细分
                if type_name == "internal-courses":
                    ct = getattr(r, "course_type", None) or "其他"
                    course_type_amounts[ct] += amount
                    course_type_counts[ct] += 1
                    daily_course_type_amount[deal_date][ct] += amount
                    daily_course_type_count[deal_date][ct] += 1
                    if customer_id:
                        course_type_persons[ct].add(customer_id)
                        daily_course_type_persons[deal_date][ct].add(customer_id)
                # 其他项目类型细分
                if type_name == "other-projects":
                    pn = getattr(r, "project_name", None) or "其他"
                    other_project_name_set.add(pn)
                    # 柱状图数据不受 name_filter 影响，始终统计全部
                    other_project_amounts[pn] += amount
                    other_project_counts[pn] += 1
                    daily_other_project_amount[deal_date][pn] += amount
                    daily_other_project_count[deal_date][pn] += 1
                    if customer_id:
                        other_project_persons[pn].add(customer_id)
                        daily_other_project_persons[deal_date][pn].add(customer_id)

    # 邀约/到访数据
    daily_invited: dict[str, int] = defaultdict(int)
    daily_arrived: dict[str, int] = defaultdict(int)
    for v in visit_service.list_visits():
        visit_date = v.visit_date
        if visit_date and date_from <= visit_date <= date_to:
            daily_invited[visit_date] += 1
            if v.arrived:
                daily_arrived[visit_date] += 1

    # 每日列表
    daily_table = []
    current = datetime.strptime(date_from, "%Y-%m-%d")
    end = datetime.strptime(date_to, "%Y-%m-%d")
    while current <= end:
        ds = current.strftime("%Y-%m-%d")
        daily_table.append({
            "date": ds,
            "invited": daily_invited.get(ds, 0),
            "arrived": daily_arrived.get(ds, 0),
            "converted_persons": len(daily_converted_persons.get(ds, set())),
            "converted_amount": round(daily_converted_amount.get(ds, 0), 2),
            "converted_count": daily_converted_count.get(ds, 0),
            "purchase_count": daily_purchase_count.get(ds, 0),
        })
        current += timedelta(days=1)

    # 按粒度聚合折线图数据
    chart_amount = _aggregate_product_by_granularity(daily_amount_by_type, granularity, date_from, date_to)
    chart_count = _aggregate_product_count_by_granularity(daily_count_by_type, granularity, date_from, date_to)
    chart_persons = _aggregate_product_count_by_granularity(
        {d: {t: len(s) for t, s in type_vals.items()} for d, type_vals in daily_persons_by_type.items()},
        granularity, date_from, date_to,
    )

    # 会员卡类型细分图表数据（始终返回全部卡类型）
    card_type_names = list(CARD_TYPES)
    # 确保所有卡类型在 daily 数据中存在（没有数据的填 0）
    for ds_dict in [daily_card_type_amount, daily_card_type_count]:
        for ct in CARD_TYPES:
            for d in ds_dict:
                if ct not in ds_dict[d]:
                    ds_dict[d][ct] = 0 if isinstance(ds_dict[d], dict) else 0
    card_type_chart_amount = _aggregate_product_by_granularity(daily_card_type_amount, granularity, date_from, date_to, CARD_TYPES)
    card_type_chart_count = _aggregate_product_count_by_granularity(daily_card_type_count, granularity, date_from, date_to, CARD_TYPES)
    card_type_chart_persons = _aggregate_product_count_by_granularity(
        {d: {t: len(s) for t, s in type_vals.items()} for d, type_vals in daily_card_type_persons.items()},
        granularity, date_from, date_to, CARD_TYPES,
    )

    # 内部课程类型细分图表数据（始终返回全部课程类型）
    course_type_names = list(COURSE_TYPES)
    for ds_dict in [daily_course_type_amount, daily_course_type_count]:
        for ct in COURSE_TYPES:
            for d in ds_dict:
                if ct not in ds_dict[d]:
                    ds_dict[d][ct] = 0
    course_type_chart_amount = _aggregate_product_by_granularity(daily_course_type_amount, granularity, date_from, date_to, COURSE_TYPES)
    course_type_chart_count = _aggregate_product_count_by_granularity(daily_course_type_count, granularity, date_from, date_to, COURSE_TYPES)
    course_type_chart_persons = _aggregate_product_count_by_granularity(
        {d: {t: len(s) for t, s in type_vals.items()} for d, type_vals in daily_course_type_persons.items()},
        granularity, date_from, date_to, COURSE_TYPES,
    )

    # 其他项目类型细分图表数据（按 project_name 动态聚合）
    other_project_names = sorted(other_project_name_set)
    if other_project_names:
        for ds_dict in [daily_other_project_amount, daily_other_project_count]:
            for pn in other_project_names:
                for d in ds_dict:
                    if pn not in ds_dict[d]:
                        ds_dict[d][pn] = 0
    other_project_chart_amount = _aggregate_product_by_granularity(daily_other_project_amount, granularity, date_from, date_to, other_project_names)
    other_project_chart_count = _aggregate_product_count_by_granularity(daily_other_project_count, granularity, date_from, date_to, other_project_names)
    other_project_chart_persons = _aggregate_product_count_by_granularity(
        {d: {t: len(s) for t, s in type_vals.items()} for d, type_vals in daily_other_project_persons.items()},
        granularity, date_from, date_to, other_project_names,
    )

    return {
        "total_amount": round(total_amount, 2),
        "type_amounts": {k: round(v, 2) for k, v in type_amounts.items()},
        "total_count": total_count,
        "type_counts": {k: v for k, v in type_counts.items()},
        "total_purchase_count": total_purchase_count,
        "total_persons": len(all_persons),
        "type_persons": {k: len(v) for k, v in type_persons.items()},
        "chart_amount": chart_amount,
        "chart_count": chart_count,
        "chart_persons": chart_persons,
        "daily_table": daily_table,
        "card_type_names": card_type_names,
        "card_type_amounts": {ct: round(card_type_amounts.get(ct, 0), 2) for ct in CARD_TYPES},
        "card_type_counts": {ct: card_type_counts.get(ct, 0) for ct in CARD_TYPES},
        "card_type_persons": {ct: len(card_type_persons.get(ct, set())) for ct in CARD_TYPES},
        "card_type_chart_amount": card_type_chart_amount,
        "card_type_chart_count": card_type_chart_count,
        "card_type_chart_persons": card_type_chart_persons,
        "course_type_names": course_type_names,
        "course_type_amounts": {ct: round(course_type_amounts.get(ct, 0), 2) for ct in COURSE_TYPES},
        "course_type_counts": {ct: course_type_counts.get(ct, 0) for ct in COURSE_TYPES},
        "course_type_persons": {ct: len(course_type_persons.get(ct, set())) for ct in COURSE_TYPES},
        "course_type_chart_amount": course_type_chart_amount,
        "course_type_chart_count": course_type_chart_count,
        "course_type_chart_persons": course_type_chart_persons,
        "other_project_names": other_project_names,
        "other_project_amounts": {pn: round(other_project_amounts.get(pn, 0), 2) for pn in other_project_names},
        "other_project_counts": {pn: other_project_counts.get(pn, 0) for pn in other_project_names},
        "other_project_persons": {pn: len(other_project_persons.get(pn, set())) for pn in other_project_names},
        "other_project_chart_amount": other_project_chart_amount,
        "other_project_chart_count": other_project_chart_count,
        "other_project_chart_persons": other_project_chart_persons,
    }


@router.get("/products/details")
def get_product_details(
    date: str = Query(..., description="日期 YYYY-MM-DD"),
    type: str = Query(..., description="详情类型: invited/arrived/persons/amount/count/purchase"),
    product_type: str | None = Query(None, description="产品类型筛选"),
):
    """获取产品数据某天某列的详情"""

    def _get_amount(r):
        return getattr(r, "fee", None) or getattr(r, "price", None) or getattr(r, "amount", None) or 0

    if type == "invited":
        records = []
        for v in visit_service.list_visits():
            if v.visit_date == date:
                c = customer_service.get_customer(v.customer_id) if v.customer_id else None
                activity_count = 0
                if v.customer_id and v.arrived:
                    activities = _build_activities(v.customer_id, {date})
                    activity_count = len(activities)
                records.append({
                    "nickname": c.nickname if c else (v.customer_id or "-"),
                    "referrer_handler": v.referrer_handler or "-",
                    "needs": v.needs or "-",
                    "arrived": v.arrived,
                    "activity_count": activity_count,
                })
        return {"data": records}

    if type == "arrived":
        records = []
        for v in visit_service.list_visits():
            if v.visit_date == date and v.arrived:
                c = customer_service.get_customer(v.customer_id) if v.customer_id else None
                activity_count = 0
                if v.customer_id:
                    activities = _build_activities(v.customer_id, {date})
                    activity_count = len(activities)
                records.append({
                    "nickname": c.nickname if c else (v.customer_id or "-"),
                    "referrer_handler": v.referrer_handler or "-",
                    "needs": v.needs or "-",
                    "activity_count": activity_count,
                })
        return {"data": records}

    if type in ("persons", "amount", "count", "purchase"):
        services = [
            ("membership-cards", membership_card_service.list_cards()),
            ("group-cases", group_case_service.list_cases()),
            ("emotional-releases", emotional_release_service.list_releases()),
            ("oh-card-readings", oh_card_reading_service.list_readings()),
            ("energy-knots", energy_knot_service.list_knots()),
            ("internal-courses", internal_course_service.list_courses()),
            ("other-projects", other_project_service.list_projects()),
        ]
        TYPE_LABELS = {
            "membership-cards": "会员卡",
            "group-cases": "觉醒游戏",
            "emotional-releases": "情绪释放",
            "oh-card-readings": "OH卡梳理",
            "energy-knots": "能量结",
            "internal-courses": "内部课程",
            "other-projects": "其他项目",
        }
        records = []
        seen_persons: set[str] = set()
        # 先收集每个客户当天购买的产品
        person_products: dict[str, list[str]] = defaultdict(list)
        for type_name, svc_records in services:
            label = TYPE_LABELS.get(type_name, type_name)
            if product_type and product_type != "全部" and label != product_type:
                continue
            for r in svc_records:
                deal_date = _get_record_date(r)
                voided = getattr(r, "voided", False)
                if deal_date == date and not voided:
                    customer_id = getattr(r, "customer_id", None)
                    if customer_id:
                        product_name = getattr(r, "card_type", None) or getattr(r, "project_name", None) or getattr(r, "course_type", None) or ""
                        if product_name:
                            person_products[customer_id].append(f"{label}：{product_name}")
                        else:
                            person_products[customer_id].append(label)
        for type_name, svc_records in services:
            label = TYPE_LABELS.get(type_name, type_name)
            if product_type and product_type != "全部" and label != product_type:
                continue
            for r in svc_records:
                deal_date = _get_record_date(r)
                voided = getattr(r, "voided", False)
                if deal_date == date and not voided:
                    customer_id = getattr(r, "customer_id", None)
                    c = customer_service.get_customer(customer_id) if customer_id else None
                    if type == "persons":
                        if customer_id and customer_id not in seen_persons:
                            seen_persons.add(customer_id)
                            activities = _build_activities(customer_id, {date})
                            activity_names = [
                                f"{a['name']}（{a['host']}）" if a.get("host") else a.get("name", "")
                                for a in activities if a.get("name")
                            ]
                            records.append({
                                "nickname": c.nickname if c else customer_id,
                                "member_type": c.member_type if c and c.member_type else "-",
                                "activities": activity_names,
                                "products": person_products.get(customer_id, []),
                            })
                    else:
                        amount = _get_amount(r)
                        # 成交人信息
                        closers = getattr(r, "closers", []) or []
                        closer_name = getattr(r, "closer_name", None)
                        if closers:
                            closers_info = [{"name": cl.get("name", ""), "amount": cl.get("amount", 0)} for cl in closers if cl.get("name")]
                        elif closer_name:
                            closers_info = [{"name": closer_name, "amount": amount}]
                        else:
                            closers_info = []
                        records.append({
                            "nickname": c.nickname if c else (customer_id or "-"),
                            "type": TYPE_LABELS.get(type_name, type_name),
                            "name": getattr(r, "card_type", None) or getattr(r, "project_name", None) or getattr(r, "course_type", None) or "",
                            "amount": amount,
                            "purchase_count": getattr(r, "purchase_count", None),
                            "closers": closers_info,
                        })
        return {"data": records}

    return {"data": []}


def _aggregate_product_by_granularity(daily_by_type: dict[str, dict[str, float]], granularity: str, date_from: str, date_to: str, types: list[str] | None = None):
    """按粒度聚合产品金额折线图数据"""
    if types is None:
        types = list(PRODUCT_TYPE_MAP.values())

    if granularity == "day":
        result = []
        current = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d")
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            row = {"date": date_str}
            for t in types:
                row[t] = round(daily_by_type.get(date_str, {}).get(t, 0), 2)
            result.append(row)
            current += timedelta(days=1)
        return result

    # 按周或月聚合
    grouped: dict[str, dict[str, float]] = defaultdict(lambda: {t: 0.0 for t in types})
    for date_str, type_vals in daily_by_type.items():
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        if granularity == "week":
            key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
        else:
            key = dt.strftime("%Y-%m")
        for t in types:
            grouped[key][t] += type_vals.get(t, 0)

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
            row = {"date": key}
            for t in types:
                row[t] = round(grouped[key].get(t, 0), 2)
            result.append(row)
        if granularity == "week":
            current += timedelta(days=7 - current.weekday())
        else:
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    return result


def _aggregate_product_count_by_granularity(daily_count_by_type: dict[str, dict[str, int]], granularity: str, date_from: str, date_to: str, types: list[str] | None = None):
    """按粒度聚合产品成交量折线图数据"""
    if types is None:
        types = list(PRODUCT_TYPE_MAP.values())

    if granularity == "day":
        result = []
        current = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d")
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            row = {"date": date_str}
            for t in types:
                row[t] = daily_count_by_type.get(date_str, {}).get(t, 0)
            result.append(row)
            current += timedelta(days=1)
        return result

    grouped: dict[str, dict[str, int]] = defaultdict(lambda: {t: 0 for t in types})
    for date_str, type_vals in daily_count_by_type.items():
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        if granularity == "week":
            key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
        else:
            key = dt.strftime("%Y-%m")
        for t in types:
            grouped[key][t] += type_vals.get(t, 0)

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
            row = {"date": key}
            for t in types:
                row[t] = grouped[key].get(t, 0)
            result.append(row)
        if granularity == "week":
            current += timedelta(days=7 - current.weekday())
        else:
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    return result


# ============ 会员情况统计 ============

def _aggregate_member_by_granularity(daily_data: dict[str, dict[str, int]], granularity: str, date_from: str, date_to: str, types: list[str]):
    """按粒度聚合会员新增人数折线图数据"""
    if granularity == "day":
        result = []
        current = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d")
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            row = {"date": date_str, "total": 0}
            for t in types:
                val = daily_data.get(date_str, {}).get(t, 0)
                row[t] = val
                row["total"] += val
            result.append(row)
            current += timedelta(days=1)
        return result

    grouped: dict[str, dict[str, int]] = defaultdict(lambda: {t: 0 for t in types})
    for date_str, type_vals in daily_data.items():
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        if granularity == "week":
            key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
        else:
            key = dt.strftime("%Y-%m")
        for t in types:
            grouped[key][t] += type_vals.get(t, 0)

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
            row = {"date": key, "total": 0}
            for t in types:
                val = grouped[key].get(t, 0)
                row[t] = val
                row["total"] += val
            result.append(row)
        if granularity == "week":
            current += timedelta(days=7 - current.weekday())
        else:
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    return result


def _aggregate_member_cumulative(cumulative_by_date: dict[str, dict[str, int]], granularity: str, date_from: str, date_to: str, types: list[str]):
    """按粒度聚合会员累计总数折线图数据"""
    if granularity == "day":
        result = []
        current = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d")
        # 找到最早的会员注册日期
        all_dates = sorted(cumulative_by_date.keys()) if cumulative_by_date else []
        earliest_date = all_dates[0] if all_dates else date_from
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            # 使用该日期的累计数据，如果没有则用最早的累计数据
            if date_str in cumulative_by_date:
                cumulative = cumulative_by_date[date_str]
            elif earliest_date < date_str:
                # 找到小于等于当前日期的最新累计数据
                latest_before = max([d for d in cumulative_by_date.keys() if d <= date_str], default=earliest_date)
                cumulative = cumulative_by_date[latest_before]
            else:
                cumulative = {t: 0 for t in types}
            row = {"date": date_str, "total": 0}
            for t in types:
                val = cumulative.get(t, 0)
                row[t] = val
                row["total"] += val
            result.append(row)
            current += timedelta(days=1)
        return result

    # 按周或月聚合
    grouped: dict[str, dict[str, int]] = {}
    for date_str, cumulative in cumulative_by_date.items():
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        if granularity == "week":
            key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
        else:
            key = dt.strftime("%Y-%m")
        # 每个周期使用该周期最后一天的累计数据
        if key not in grouped or date_str > max(grouped.keys(), default=""):
            grouped[key] = cumulative

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
            cumulative = grouped.get(key, {t: 0 for t in types})
            row = {"date": key, "total": 0}
            for t in types:
                val = cumulative.get(t, 0)
                row[t] = val
                row["total"] += val
            result.append(row)
        if granularity == "week":
            current += timedelta(days=7 - current.weekday())
        else:
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    return result


@router.get("/members")
def get_member_statistics(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    granularity: str = Query("day", description="聚合粒度: day/week/month"),
):
    """获取会员情况统计：各类型会员人数 + 新增人数变化趋势"""
    date_from, date_to = _get_date_range(date_from, date_to)

    # 获取所有会员身份类型（倒序）
    identities = member_identity_service.list_identities()
    type_names = [identity.name for identity in reversed(identities)]

    # 获取所有客户
    customers = customer_service.list_customers()

    # 1. 统计当前各类型会员总人数
    type_totals: dict[str, int] = {name: 0 for name in type_names}
    total_members = 0
    for c in customers:
        mt = c.member_type or ""
        if mt in type_totals:
            type_totals[mt] += 1
            total_members += 1

    # 2. 统计所有会员的注册日期（用于累计总数计算）
    all_members_by_date: dict[str, dict[str, int]] = defaultdict(lambda: {name: 0 for name in type_names})
    for c in customers:
        created_at = c.created_at
        if isinstance(created_at, datetime):
            date_str = created_at.strftime("%Y-%m-%d")
        elif created_at:
            date_str = str(created_at)[:10]
        else:
            continue

        mt = c.member_type or ""
        if mt in type_totals:
            all_members_by_date[date_str][mt] += 1

    # 3. 按时间范围统计新增人数（用于新增模式）
    daily_new_by_type: dict[str, dict[str, int]] = defaultdict(lambda: {name: 0 for name in type_names})
    for date_str, types in all_members_by_date.items():
        if date_from <= date_str <= date_to:
            daily_new_by_type[date_str] = types

    # 4. 计算累计总数（从最早会员到每一天）
    sorted_dates = sorted(all_members_by_date.keys())
    cumulative_by_date: dict[str, dict[str, int]] = {}
    cumulative = {name: 0 for name in type_names}
    for date_str in sorted_dates:
        for name in type_names:
            cumulative[name] += all_members_by_date[date_str].get(name, 0)
        cumulative_by_date[date_str] = dict(cumulative)

    # 5. 按粒度聚合折线图数据
    chart_data_new = _aggregate_member_by_granularity(daily_new_by_type, granularity, date_from, date_to, type_names)
    chart_data_total = _aggregate_member_cumulative(cumulative_by_date, granularity, date_from, date_to, type_names)

    # 6. 获取所有客户的详细统计信息（用于人员列表）
    members_list = []
    for c in customers:
        mt = c.member_type or ""
        if mt not in type_totals:
            continue
        stats = _get_customer_stats(c.id, None, None)
        members_list.append({
            "id": c.id,
            "nickname": c.nickname or "",
            "member_type": mt,
            "first_visit_date": stats.get("first_visit_date", "-"),
            "invited_count": stats.get("invited_count", 0),
            "visit_count": stats.get("visit_count", 0),
            "visit_interval": stats.get("visit_interval", "-"),
            "activity_count": stats.get("activity_count", 0),
            "total_consumption": stats.get("total_consumption", 0),
        })

    return {
        "total_members": total_members,
        "type_totals": type_totals,
        "type_names": type_names,
        "chart_new": chart_data_new,
        "chart_total": chart_data_total,
        "members": members_list,
    }
