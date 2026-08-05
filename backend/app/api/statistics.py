"""统计 API — 客户经营指标 / 邀约到访 / 实际到访 / 成交人数 / 会员情况"""
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Query

from app.api.customer_detail import _build_activities, _build_payment_records
from app.models.customer import FollowUpStatus
from app.services import (
    class_record_service,
    course_service,
    course_type_service,
    customer_service,
    emotional_release_service,
    emotional_release_session_service,
    energy_knot_service,
    energy_knot_session_service,
    group_case_service,
    group_case_session_service,
    internal_course_service,
    internal_course_session_service,
    member_identity_service,
    membership_card_service,
    oh_card_reading_service,
    oh_card_reading_session_service,
    organization_service,
    other_project_service,
    visit_service,
)

router = APIRouter(prefix="/api/statistics", tags=["statistics"])

HEALING_TEACHER_POSITIONS = {"成就君", "能量结老师", "课程老师"}


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


def _record_matches_teacher(record, teacher_id: str, teacher_names: set[str]) -> bool:
    """成交记录是否归属于指定疗愈老师，兼容新旧成交人字段。"""
    if not teacher_id:
        return True
    closers = getattr(record, "closers", None) or []
    for closer in closers:
        closer_id = str(closer.get("id") or "").strip()
        closer_name = str(closer.get("name") or "").strip()
        if closer_id == teacher_id or (closer_name and closer_name in teacher_names):
            return True
    legacy_id = str(getattr(record, "closer_id", None) or "").strip()
    legacy_name = str(getattr(record, "closer_name", None) or "").strip()
    return legacy_id == teacher_id or bool(legacy_name and legacy_name in teacher_names)


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

    # 参与活动次数：与详情弹窗使用同一活动集合，并按统计范围过滤活动日期
    arrived_dates = {v.visit_date for v in arrived_visits}
    activities = _build_activities(customer_id)
    if date_from and date_to:
        activities = [
            activity
            for activity in activities
            if activity.get("date") and date_from <= activity["date"] <= date_to
        ]
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


def _normalize_query_str(value) -> str | None:
    """兼容直接调用函数的场景：FastAPI Query 默认值会是 Query 对象，统一归一化为 str | None"""
    return value if isinstance(value, str) else None


def _parse_member_types(member_types: str | None) -> set[str]:
    """解析逗号分隔的会员类型多选筛选参数，空集合表示不筛选"""
    member_types = _normalize_query_str(member_types)
    if not member_types:
        return set()
    return {t.strip() for t in member_types.split(",") if t.strip()}


def _sort_member_type_names(names: set[str]) -> list[str]:
    """会员类型选项按身份配置顺序排列（与会员情况页一致），未配置的排在末尾"""
    identities = member_identity_service.list_identities()
    order = [identity.name for identity in reversed(identities)]
    ordered = [name for name in order if name in names]
    extras = sorted(name for name in names if name and name not in order)
    return ordered + extras


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
    member_types: str | None = Query(None, description="会员类型筛选，逗号分隔多选"),
    referrer: str | None = Query(None, description="引流人筛选"),
):
    date_from, date_to = _get_date_range(date_from, date_to)
    type_filter = _parse_member_types(member_types)
    referrer_filter = (_normalize_query_str(referrer) or "").strip()

    customers_map = {c.id: c for c in customer_service.list_customers()}

    def _visit_visible(v) -> bool:
        """邀约/到访记录是否通过筛选：会员类型看客户资料，引流人看邀约记录上的邀约人"""
        if type_filter:
            c = customers_map.get(v.customer_id or "")
            if not c or (c.member_type or "") not in type_filter:
                return False
        if referrer_filter and (v.referrer_handler or "").strip() != referrer_filter:
            return False
        return True

    def _customer_visible(customer_id: str | None) -> bool:
        """成交记录是否通过筛选：会员类型和引流人均看客户资料"""
        if not type_filter and not referrer_filter:
            return True
        if not customer_id:
            return False
        c = customers_map.get(customer_id)
        if type_filter and (not c or (c.member_type or "") not in type_filter):
            return False
        if referrer_filter and ((c.referrer if c else "") or "").strip() != referrer_filter:
            return False
        return True

    # 按日期聚合数据
    daily: dict[str, dict] = defaultdict(lambda: {"invited": 0, "arrived": 0, "converted": 0, "converted_amount": 0.0})

    # 1. 邀约到访 / 实际到访
    visits = visit_service.list_visits()
    for v in visits:
        visit_date = v.visit_date
        if visit_date and date_from <= visit_date <= date_to and _visit_visible(v):
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
            if deal_date and customer_id and date_from <= deal_date <= date_to and _customer_visible(customer_id):
                converted_by_date[deal_date].add(customer_id)

    for date_str, customer_ids in converted_by_date.items():
        daily[date_str]["converted"] = len(customer_ids)

    # 3. 成交金额（按 deal_date 累加，排除已作废）
    for records in services:
        for r in records:
            deal_date = _get_record_date(r)
            price = _get_record_amount(r)
            voided = getattr(r, "voided", False)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and not voided and date_from <= deal_date <= date_to and _customer_visible(customer_id):
                daily[deal_date]["converted_amount"] += price

    data = _aggregate_by_granularity(daily, granularity, date_from, date_to)
    return {"data": data}


@router.get("/details")
def get_details(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    status: str = Query(None, description="状态筛选: invited/arrived/converted"),
    total: bool = Query(False, description="是否统计总数据（不限日期范围）"),
    member_types: str | None = Query(None, description="会员类型筛选，逗号分隔多选"),
    referrer: str | None = Query(None, description="引流人筛选"),
):
    date_from, date_to = _get_date_range(date_from, date_to)
    type_filter = _parse_member_types(member_types)
    referrer_filter = (_normalize_query_str(referrer) or "").strip()

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
    # 筛选选项（在过滤前收集，保证选项不随筛选塌缩）
    option_member_types: set[str] = set()
    option_referrer_counts: dict[str, int] = defaultdict(int)
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
            visit_referrer = (v.referrer_handler or "").strip()
            if member_type:
                option_member_types.add(member_type)
            if visit_referrer:
                option_referrer_counts[visit_referrer] += 1
            # 会员类型看客户资料，引流人看邀约记录上的邀约人
            if type_filter and member_type not in type_filter:
                continue
            if referrer_filter and visit_referrer != referrer_filter:
                continue
            # 如果该客户在时间范围内有成交，状态标记为已成交
            is_converted = cid in converted_customer_ids
            invited_list.append({
                "customer_id": cid,
                "nickname": nick,
                "date": visit_date,
                "status": "converted" if is_converted else "invited",
                "arrived": v.arrived,
                "member_type": member_type,
                "referrer_handler": visit_referrer,
            })
            if v.arrived:
                arrived_list.append({
                    "customer_id": cid,
                    "nickname": nick,
                    "date": visit_date,
                    "status": "converted" if is_converted else "arrived",
                    "arrived": True,
                    "member_type": member_type,
                    "referrer_handler": visit_referrer,
                })

    # 3. 获取成交人员
    converted_list = []
    for type_name, records in services:
        for r in records:
            deal_date = _get_record_date(r)
            customer_id = getattr(r, "customer_id", None)
            if deal_date and customer_id and date_from <= deal_date <= date_to:
                c = customers_map.get(customer_id)
                c_member_type = c.member_type if c and c.member_type else ""
                c_referrer = ((c.referrer if c else "") or "").strip()
                if c_member_type:
                    option_member_types.add(c_member_type)
                if c_referrer:
                    option_referrer_counts[c_referrer] += 1
                # 成交记录的会员类型和引流人均看客户资料
                if type_filter and c_member_type not in type_filter:
                    continue
                if referrer_filter and c_referrer != referrer_filter:
                    continue
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
                    "member_type": c_member_type,
                    "referrer_handler": c_referrer,
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
            _daily_activity_cache[cache_key] = _build_activities(
                cid,
                date_filter={deal_date},
            )
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
            # 全量筛选选项（不受会员类型/引流人筛选影响，避免选项塌缩）
            "member_type_names": _sort_member_type_names(option_member_types),
            "referrer_names": [name for name, _ in sorted(option_referrer_counts.items(), key=lambda item: (-item[1], item[0]))],
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
    referrer: str | None = Query(None, description="引流人筛选"),
    teacher_id: str | None = Query(None, description="疗愈老师客户ID（按成交人筛选）"),
):
    date_from, date_to = _get_date_range(date_from, date_to)
    referrer_filter = (_normalize_query_str(referrer) or "").strip()
    teacher_filter = (_normalize_query_str(teacher_id) or "").strip()
    customers_map = {c.id: c for c in customer_service.list_customers()}
    teacher_course_hours = _course_teacher_hours_in_range(date_from, date_to)
    teachers = sorted(
        (
            {"id": customer.id, "name": customer.nickname or customer.name or customer.id}
            for customer in customers_map.values()
            if HEALING_TEACHER_POSITIONS.intersection(customer.positions or [])
        ),
        key=lambda item: (-teacher_course_hours.get(item["id"], 0), item["name"], item["id"]),
    )
    selected_teacher = customers_map.get(teacher_filter)
    teacher_names = {
        value.strip()
        for value in (
            selected_teacher.nickname if selected_teacher else "",
            selected_teacher.name if selected_teacher else "",
        )
        if value and value.strip()
    }

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

    # 引流人统计（不受 referrer_filter 影响，用于生成筛选选项）
    option_referrer_counts: dict[str, int] = defaultdict(int)

    for type_name, records in services:
        label = PRODUCT_TYPE_MAP[type_name]
        if product_type and product_type != "全部" and label != product_type:
            continue
        for r in records:
            deal_date = _get_record_date(r)
            customer_id = getattr(r, "customer_id", None)
            voided = getattr(r, "voided", False)
            if deal_date and not voided and date_from <= deal_date <= date_to:
                # 引流人筛选
                c_referrer = ((customers_map.get(customer_id).referrer if customers_map.get(customer_id) else None) or "").strip()
                if c_referrer:
                    option_referrer_counts[c_referrer] += 1
                if referrer_filter and c_referrer != referrer_filter:
                    continue
                if teacher_filter and not _record_matches_teacher(r, teacher_filter, teacher_names):
                    continue
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
        "referrer_names": [name for name, _ in sorted(option_referrer_counts.items(), key=lambda item: (-item[1], item[0]))],
        "teachers": teachers,
    }


@router.get("/products/details")
def get_product_details(
    date: str = Query(..., description="日期 YYYY-MM-DD"),
    type: str = Query(..., description="详情类型: invited/arrived/persons/amount/count/purchase"),
    product_type: str | None = Query(None, description="产品类型筛选"),
    referrer: str | None = Query(None, description="引流人筛选"),
    teacher_id: str | None = Query(None, description="疗愈老师客户ID（按成交人筛选）"),
):
    """获取产品数据某天某列的详情"""

    def _get_amount(r):
        return getattr(r, "fee", None) or getattr(r, "price", None) or getattr(r, "amount", None) or 0

    referrer_filter = (_normalize_query_str(referrer) or "").strip()
    teacher_filter = (_normalize_query_str(teacher_id) or "").strip()
    customers_map = {c.id: c for c in customer_service.list_customers()}
    selected_teacher = customers_map.get(teacher_filter)
    teacher_names = {
        value.strip()
        for value in (
            selected_teacher.nickname if selected_teacher else "",
            selected_teacher.name if selected_teacher else "",
        )
        if value and value.strip()
    }

    def _record_visible(record) -> bool:
        customer = customers_map.get(getattr(record, "customer_id", None) or "")
        if referrer_filter and ((customer.referrer if customer else "") or "").strip() != referrer_filter:
            return False
        return _record_matches_teacher(record, teacher_filter, teacher_names)

    if type == "invited":
        records = []
        for v in visit_service.list_visits():
            if v.visit_date == date:
                c = customer_service.get_customer(v.customer_id) if v.customer_id else None
                activity_count = 0
                if v.customer_id and v.arrived:
                    activities = _build_activities(
                        v.customer_id,
                        date_filter={date},
                    )
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
                    activities = _build_activities(
                        v.customer_id,
                        date_filter={date},
                    )
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
                if deal_date == date and not voided and _record_visible(r):
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
                if deal_date == date and not voided and _record_visible(r):
                    customer_id = getattr(r, "customer_id", None)
                    c = customer_service.get_customer(customer_id) if customer_id else None
                    if type == "persons":
                        if customer_id and customer_id not in seen_persons:
                            seen_persons.add(customer_id)
                            activities = _build_activities(
                                customer_id,
                                date_filter={date},
                            )
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
            elif cumulative_by_date and earliest_date < date_str:
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
    referrer: str | None = Query(None, description="引流人昵称"),
):
    """获取会员情况统计：各类型会员人数 + 新增人数变化趋势"""
    date_from, date_to = _get_date_range(date_from, date_to)

    # 获取所有会员身份类型（倒序）
    identities = member_identity_service.list_identities()
    type_names = [identity.name for identity in reversed(identities)]

    # 获取所有客户，按引流人筛选
    all_customers = customer_service.list_customers()
    customers = [
        c for c in all_customers
        if not referrer or (c.referrer or "").strip() == referrer
    ]

    # 引流人选项（只统计选定时间范围内有数据的引流人，按人数降序排列）
    referrer_counts: dict[str, int] = defaultdict(int)
    for c in all_customers:
        if isinstance(c.created_at, datetime):
            created_date = c.created_at.strftime("%Y-%m-%d")
        elif c.created_at:
            created_date = str(c.created_at)[:10]
        else:
            continue
        if not (date_from <= created_date <= date_to):
            continue
        name = (c.referrer or "").strip()
        if name:
            referrer_counts[name] += 1
    referrer_names = [
        name for name, _ in sorted(referrer_counts.items(), key=lambda item: (-item[1], item[0]))
    ]

    # 1. 统计所有会员的注册日期（用于累计总数计算）
    valid_types = set(type_names)
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
        if mt in valid_types:
            all_members_by_date[date_str][mt] += 1

    # 2. 按时间范围统计新增人数（用于新增模式）
    daily_new_by_type: dict[str, dict[str, int]] = defaultdict(lambda: {name: 0 for name in type_names})
    for date_str, types in all_members_by_date.items():
        if date_from <= date_str <= date_to:
            daily_new_by_type[date_str] = types

    # 3. 统计当前各类型会员总人数（只统计选定时间范围内新增的）
    type_totals: dict[str, int] = {name: 0 for name in type_names}
    for types in daily_new_by_type.values():
        for name in type_names:
            type_totals[name] += types.get(name, 0)
    total_members = sum(type_totals.values())

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
            "created_date": (
                c.created_at.strftime("%Y-%m-%d")
                if isinstance(c.created_at, datetime)
                else str(c.created_at)[:10] if c.created_at else ""
            ),
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
        "referrer_names": referrer_names,
        "chart_new": chart_data_new,
        "chart_total": chart_data_total,
        "members": members_list,
    }


# ============ 课程数据统计 ============

COURSE_ACTIVITY_TYPES = (
    ("class", "沙龙活动", class_record_service.list_records),
    ("gcs", "觉醒游戏", group_case_session_service.list_sessions),
    ("ers", "情绪释放", emotional_release_session_service.list_sessions),
    ("ocr", "OH卡梳理", oh_card_reading_session_service.list_sessions),
    ("eks", "能量结", energy_knot_session_service.list_sessions),
    ("ics", "内部课程", internal_course_session_service.list_sessions),
)

INTERNAL_COURSE_SUBTYPES = ("疗愈师课程", "商业框架陪跑", "落地赋能班")


def _course_subtype_name(activity_type: str, activity) -> str:
    """统一课程二级分类名称，兼容内部课程的新旧长名称。"""
    subtype = (getattr(activity, "course_type", "") or "未分类").strip()
    if activity_type != "ics":
        return subtype
    if subtype.startswith("疗愈师"):
        return "疗愈师课程"
    if subtype.startswith("商业框架") or subtype.startswith("陪跑"):
        return "商业框架陪跑"
    if subtype.startswith("落地赋能") or subtype.startswith("赋能"):
        return "落地赋能班"
    return subtype


def _course_participant_ids(activity_type: str, activity) -> set[str]:
    """只保留参与者身份；组长仍属于参与者，排除老师、案主等特殊身份。"""
    if activity_type == "class":
        return set(class_record_service._get_group_member_ids(activity))

    participant_ids = set(getattr(activity, "participant_ids", []) or [])
    participant_ids -= set(getattr(activity, "teacher_ids", []) or [])
    for field in ("owner_id", "host_id", "achiever_id"):
        special_id = getattr(activity, field, "")
        if special_id:
            participant_ids.discard(special_id)
    return participant_ids


def _course_activity_teacher_ids(activity) -> set[str]:
    """课程负责人包含老师；未配置老师的专项活动使用成就君。"""
    teacher_ids = set(getattr(activity, "teacher_ids", []) or [])
    achiever_id = getattr(activity, "achiever_id", "")
    if achiever_id:
        teacher_ids.add(achiever_id)
    return teacher_ids


def _course_participant_roles(activity_type: str, activity) -> dict[str, str]:
    """返回参与者在单场课程中的身份，组长优先于副组长和普通参与者。"""
    roles = {participant_id: "参与者" for participant_id in _course_participant_ids(activity_type, activity)}
    if activity_type != "class":
        return roles
    for group in getattr(activity, "groups", []) or []:
        deputy_id = getattr(group, "deputy_id", "")
        leader_id = getattr(group, "leader_id", "")
        if deputy_id in roles:
            roles[deputy_id] = "副组长"
        if leader_id in roles:
            roles[leader_id] = "组长"
    return roles


def _course_activity_organization_ids(
    activity_type: str,
    activity,
    course_organizations: dict[str, str],
    course_name_organizations: dict[str, str],
    type_organizations: dict[str, str],
    member_organizations: dict[str, set[str]],
) -> set[str]:
    """优先读取课程配置所属组织，系统活动回退到老师所在组织。"""
    organization_ids: set[str] = set()
    if activity_type == "class":
        course_id = getattr(activity, "course_id", "")
        course_name = getattr(activity, "course_name", "")
        course_type = getattr(activity, "course_type", "")
        if course_id and course_organizations.get(course_id):
            organization_ids.add(course_organizations[course_id])
        if course_name and course_name_organizations.get(course_name):
            organization_ids.add(course_name_organizations[course_name])
        if course_type and type_organizations.get(course_type):
            organization_ids.add(type_organizations[course_type])
    elif activity_type == "ics":
        course_type = getattr(activity, "course_type", "")
        if course_type and type_organizations.get(course_type):
            organization_ids.add(type_organizations[course_type])

    for teacher_id in _course_activity_teacher_ids(activity):
        organization_ids.update(member_organizations.get(teacher_id, set()))
    return organization_ids


def _course_period_key(date_str: str, granularity: str) -> str:
    """将活动日期归入日、ISO 周或自然月。"""
    if granularity == "day":
        return date_str
    value = datetime.strptime(date_str, "%Y-%m-%d")
    if granularity == "week":
        iso_year, iso_week, _ = value.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return value.strftime("%Y-%m")


def _course_trend_rows(
    grouped: dict[str, dict[str, int | float]],
    date_from: str,
    date_to: str,
    granularity: str,
) -> list[dict]:
    """补齐范围内无课程的时间点，保证折线图时间轴连续。"""
    keys: list[str] = []
    seen: set[str] = set()
    current = datetime.strptime(date_from, "%Y-%m-%d")
    end = datetime.strptime(date_to, "%Y-%m-%d")
    while current <= end:
        key = _course_period_key(current.strftime("%Y-%m-%d"), granularity)
        if key not in seen:
            seen.add(key)
            keys.append(key)
        current += timedelta(days=1)
    return [
        {
            "date": key,
            "course_count": grouped[key]["course_count"],
            "class_hours": grouped[key]["class_hours"],
            "participant_count": grouped[key]["participant_count"],
            "transaction_amount": round(grouped[key]["transaction_amount"], 2),
        }
        for key in keys
    ]


def _teacher_transaction_amounts(
    teachers: list,
    date_from: str,
    date_to: str,
    payment_groups: list[list] | None = None,
    allowed_customer_dates: set[tuple[str, str]] | None = None,
) -> dict[str, float]:
    """按付费记录成交人归集老师成交额，多成交人使用各自填写的分摊金额。"""
    teacher_ids = {teacher.id for teacher in teachers}
    teacher_by_name: dict[str, str] = {}
    for teacher in teachers:
        for name in (teacher.nickname, teacher.name):
            normalized = (name or "").strip()
            if normalized:
                teacher_by_name[normalized] = teacher.id

    amounts: dict[str, float] = defaultdict(float)
    for records in payment_groups or _payment_record_groups():
        for record in records:
            record_date = _get_record_date(record)
            if (
                not record_date
                or not date_from <= record_date <= date_to
                or getattr(record, "voided", False)
            ):
                continue
            customer_id = getattr(record, "customer_id", "") or ""
            if allowed_customer_dates is not None and (record_date, customer_id) not in allowed_customer_dates:
                continue

            record_amount = _get_record_amount(record)
            closers = getattr(record, "closers", []) or []
            matched_closers: list[tuple[str, float]] = []
            for closer in closers:
                closer_id = (closer.get("id") or "").strip()
                if closer_id not in teacher_ids:
                    closer_id = teacher_by_name.get((closer.get("name") or "").strip(), "")
                if closer_id:
                    matched_closers.append((closer_id, float(closer.get("amount") or 0)))

            if matched_closers:
                if len(closers) == 1 and matched_closers[0][1] == 0:
                    teacher_id, _amount = matched_closers[0]
                    amounts[teacher_id] += record_amount
                else:
                    for teacher_id, amount in matched_closers:
                        amounts[teacher_id] += amount
                continue

            closer_id = (getattr(record, "closer_id", None) or "").strip()
            if closer_id not in teacher_ids:
                closer_id = teacher_by_name.get(
                    (getattr(record, "closer_name", None) or "").strip(),
                    "",
                )
            if closer_id:
                amounts[closer_id] += record_amount

    return amounts


def _course_customer_daily_context(
    date_from: str,
    date_to: str,
    payment_groups: list[list],
) -> tuple[dict[tuple[str, str], dict], dict[tuple[str, str], str]]:
    """构建客户每日成交与需求索引，供趋势和课程人员弹窗共用。"""
    payments: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"amount": 0.0, "closers": set()}
    )
    for records in payment_groups:
        for record in records:
            record_date = _get_record_date(record)
            customer_id = getattr(record, "customer_id", "")
            if (
                not record_date
                or not customer_id
                or not date_from <= record_date <= date_to
                or getattr(record, "voided", False)
            ):
                continue
            key = (record_date, customer_id)
            payments[key]["amount"] += _get_record_amount(record)
            closer_names = {
                (closer.get("name") or "").strip()
                for closer in (getattr(record, "closers", []) or [])
                if (closer.get("name") or "").strip()
            }
            legacy_closer = (getattr(record, "closer_name", None) or "").strip()
            if legacy_closer:
                closer_names.add(legacy_closer)
            payments[key]["closers"].update(closer_names)

    needs_by_customer_date: dict[tuple[str, str], list[str]] = defaultdict(list)
    for visit in visit_service.list_visits():
        visit_date = getattr(visit, "visit_date", "")
        customer_id = getattr(visit, "customer_id", "")
        needs = (getattr(visit, "needs", None) or "").strip()
        if date_from <= visit_date <= date_to and customer_id and needs:
            key = (visit_date, customer_id)
            if needs not in needs_by_customer_date[key]:
                needs_by_customer_date[key].append(needs)
    return payments, {
        key: "；".join(values)
        for key, values in needs_by_customer_date.items()
    }


def _course_activity_name(activity_type: str, label: str, activity) -> str:
    if activity_type == "class":
        return getattr(activity, "activity_name", "") or getattr(activity, "course_name", "") or label
    return getattr(activity, "name", "") or getattr(activity, "course_name", "") or label


def _course_activity_hours(activity_type: str, activity) -> int:
    """课程课时：能量结按案主实际销卡数，其他活动按会员扣卡次数。"""
    if activity_type == "eks":
        return energy_knot_session_service.get_session_deduction_count(activity)
    try:
        return max(0, int(getattr(activity, "membership_deduction_count", 1) or 0))
    except (TypeError, ValueError):
        return 1


def _course_teacher_hours(activities_by_type: dict[str, list]) -> dict[str, int]:
    """按课程实际课时汇总每位老师，用于老师筛选项排序。"""
    hours_by_teacher: dict[str, int] = defaultdict(int)
    for activity_type, activities in activities_by_type.items():
        for activity in activities:
            activity_hours = _course_activity_hours(activity_type, activity)
            for activity_teacher_id in _course_activity_teacher_ids(activity):
                hours_by_teacher[activity_teacher_id] += activity_hours
    return dict(hours_by_teacher)


def _course_teacher_hours_in_range(date_from: str, date_to: str) -> dict[str, int]:
    activities_by_type = {
        type_key: list(loader(start_date=date_from, end_date=date_to))
        for type_key, _label, loader in COURSE_ACTIVITY_TYPES
    }
    return _course_teacher_hours(activities_by_type)


@router.get("/courses")
def get_course_statistics(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    granularity: str = Query("day", description="时间单位: day/week/month"),
    organization_id: str | None = Query(None, description="所属组织 ID"),
    activity_type: str | None = Query(None, description="活动类型编码"),
    course_subtype: str | None = Query(None, description="沙龙活动或内部课程二级类目"),
    teacher_id: str | None = Query(None, description="疗愈老师客户 ID"),
):
    """获取课程数、课时数及参与人数统计。"""
    date_from, date_to = _get_date_range(date_from, date_to)
    if granularity not in {"day", "week", "month"}:
        granularity = "day"
    organization_filter = (_normalize_query_str(organization_id) or "").strip()
    course_subtype_filter = (_normalize_query_str(course_subtype) or "").strip()

    organizations = organization_service.list_organizations()
    member_organizations: dict[str, set[str]] = defaultdict(set)
    for organization in organizations:
        for member_id in organization.member_ids:
            member_organizations[member_id].add(organization.id)

    courses = course_service.list_courses()
    course_organizations = {
        course.id: course.organization_id
        for course in courses
        if course.organization_id
    }
    course_name_organizations = {
        course.name: course.organization_id
        for course in courses
        if course.name and course.organization_id
    }
    course_type_configs = course_type_service.list_course_types()
    type_organizations = {
        item.get("name", ""): item.get("organization_id", "")
        for item in course_type_configs
        if item.get("name") and item.get("organization_id")
    }

    all_customers = customer_service.list_customers()
    customer_map = {customer.id: customer for customer in all_customers}
    identity_groups = {
        identity.name: identity.type
        for identity in member_identity_service.list_identities()
    }
    teachers = [
        customer
        for customer in all_customers
        if HEALING_TEACHER_POSITIONS.intersection(customer.positions or [])
        and (
            not organization_filter
            or organization_filter in member_organizations.get(customer.id, set())
        )
    ]

    selected_types = {
        key
        for key, _label, _loader in COURSE_ACTIVITY_TYPES
        if not activity_type or activity_type == "all" or key == activity_type
    }
    activities_by_type = {
        type_key: list(loader(start_date=date_from, end_date=date_to))
        for type_key, _label, loader in COURSE_ACTIVITY_TYPES
    }

    def _matches_organization(type_key: str, activity) -> bool:
        activity_organization_ids = _course_activity_organization_ids(
            type_key,
            activity,
            course_organizations,
            course_name_organizations,
            type_organizations,
            member_organizations,
        )
        return not organization_filter or organization_filter in activity_organization_ids

    def _matches_common_filters(type_key: str, activity) -> bool:
        activity_teacher_ids = _course_activity_teacher_ids(activity)
        if teacher_id and teacher_id not in activity_teacher_ids:
            return False
        return _matches_organization(type_key, activity)

    teacher_course_hours = _course_teacher_hours({
        type_key: [
            activity
            for activity in activities
            if type_key in selected_types
            and _matches_organization(type_key, activity)
            and not (
                type_key in {"class", "ics"}
                and course_subtype_filter
                and _course_subtype_name(type_key, activity) != course_subtype_filter
            )
        ]
        for type_key, activities in activities_by_type.items()
    })
    teachers.sort(key=lambda customer: (
        -teacher_course_hours.get(customer.id, 0),
        customer.nickname or customer.name or "",
        customer.id,
    ))

    base_activities_by_type = {
        type_key: [
            activity
            for activity in activities
            if _matches_common_filters(type_key, activity)
        ]
        for type_key, activities in activities_by_type.items()
    }
    selected_activities_by_type = {
        type_key: [
            activity
            for activity in base_activities_by_type[type_key]
            if not (
                type_key in {"class", "ics"}
                and course_subtype_filter
                and _course_subtype_name(type_key, activity) != course_subtype_filter
            )
        ]
        for type_key in selected_types
    }

    subtype_activity_type = activity_type if activity_type in {"class", "ics"} else ""
    if subtype_activity_type == "class":
        subtype_names = [
            item.get("name", "")
            for item in course_type_configs
            if item.get("name") and item.get("category") != "other"
        ]
    elif subtype_activity_type == "ics":
        subtype_names = list(INTERNAL_COURSE_SUBTYPES)
    else:
        subtype_names = []
    for activity in base_activities_by_type.get(subtype_activity_type, []):
        subtype_name = _course_subtype_name(subtype_activity_type, activity)
        if subtype_name and subtype_name not in subtype_names:
            subtype_names.append(subtype_name)
    subtype_totals = {
        subtype_name: {"course_count": 0, "class_hours": 0, "participant_count": 0}
        for subtype_name in subtype_names
    }
    for activity in base_activities_by_type.get(subtype_activity_type, []):
        subtype_name = _course_subtype_name(subtype_activity_type, activity)
        if subtype_name not in subtype_totals:
            subtype_totals[subtype_name] = {"course_count": 0, "class_hours": 0, "participant_count": 0}
            subtype_names.append(subtype_name)
        activity_hours = _course_activity_hours(subtype_activity_type, activity)
        subtype_totals[subtype_name]["course_count"] += 1
        subtype_totals[subtype_name]["class_hours"] += activity_hours
        subtype_totals[subtype_name]["participant_count"] += len(
            _course_participant_ids(subtype_activity_type, activity)
        )
    payment_groups = _payment_record_groups()
    daily_payments, daily_needs = _course_customer_daily_context(
        date_from,
        date_to,
        payment_groups,
    )
    trend_grouped: dict[str, dict[str, int | float]] = defaultdict(
        lambda: {
            "course_count": 0,
            "class_hours": 0,
            "participant_count": 0,
            "transaction_amount": 0.0,
        }
    )
    filtered_participants_by_date: dict[str, set[str]] = defaultdict(set)
    course_rows: list[dict] = []
    statistics = []
    for type_key, label, loader in COURSE_ACTIVITY_TYPES:
        if type_key not in selected_types:
            continue

        course_count = 0
        class_hours = 0
        participant_count = 0
        for activity in selected_activities_by_type[type_key]:
            teacher_ids = _course_activity_teacher_ids(activity)
            course_count += 1
            activity_hours = _course_activity_hours(type_key, activity)
            participant_roles = _course_participant_roles(type_key, activity)
            participant_ids = set(participant_roles)
            activity_participants = len(participant_ids)
            class_hours += activity_hours
            participant_count += activity_participants
            filtered_participants_by_date[activity.date].update(participant_ids)
            period_key = _course_period_key(activity.date, granularity)
            trend_grouped[period_key]["course_count"] += 1
            trend_grouped[period_key]["class_hours"] += activity_hours
            trend_grouped[period_key]["participant_count"] += activity_participants

            participant_details = []
            for participant_id in participant_ids:
                customer = customer_map.get(participant_id)
                member_type = getattr(customer, "member_type", "") if customer else ""
                identity_group = identity_groups.get(member_type, "") or "老人"
                payment = daily_payments.get(
                    (activity.date, participant_id),
                    {"amount": 0.0, "closers": set()},
                )
                participant_details.append({
                    "id": participant_id,
                    "nickname": (
                        getattr(customer, "nickname", "")
                        or getattr(customer, "name", "")
                        or participant_id
                    ),
                    "member_type": member_type,
                    "identity_group": identity_group,
                    "participation_role": participant_roles[participant_id],
                    "daily_need": daily_needs.get((activity.date, participant_id), ""),
                    "daily_transaction_amount": round(payment["amount"], 2),
                    "closers": "、".join(sorted(payment["closers"])),
                })
            participant_details.sort(key=lambda item: (item["nickname"], item["id"]))
            teacher_names = []
            for activity_teacher_id in teacher_ids:
                teacher = customer_map.get(activity_teacher_id)
                name = (
                    getattr(teacher, "nickname", "")
                    or getattr(teacher, "name", "")
                    or (
                        getattr(activity, "achiever_name", "")
                        if activity_teacher_id == getattr(activity, "achiever_id", "")
                        else ""
                    )
                    or activity_teacher_id
                )
                if name not in teacher_names:
                    teacher_names.append(name)
            course_rows.append({
                "id": f"{type_key}:{activity.id}",
                "activity_type": type_key,
                "activity_type_label": label,
                "name": _course_activity_name(type_key, label, activity),
                "date": activity.date,
                "start_time": getattr(activity, "start_time", "") or "",
                "end_time": getattr(activity, "end_time", "") or "",
                "class_hours": activity_hours,
                "teachers": teacher_names,
                "participant_count": activity_participants,
                "new_count": sum(
                    item["identity_group"] == "新人"
                    for item in participant_details
                ),
                "old_count": sum(
                    item["identity_group"] != "新人"
                    for item in participant_details
                ),
                "daily_transaction_amount": round(sum(
                    item["daily_transaction_amount"]
                    for item in participant_details
                ), 2),
                "participants": participant_details,
            })

        statistics.append({
            "type": type_key,
            "label": label,
            "course_count": course_count,
            "class_hours": class_hours,
            "participant_count": participant_count,
        })

    for activity_date, participant_ids in filtered_participants_by_date.items():
        period_key = _course_period_key(activity_date, granularity)
        trend_grouped[period_key]["transaction_amount"] += sum(
            daily_payments.get(
                (activity_date, participant_id),
                {"amount": 0.0},
            )["amount"]
            for participant_id in participant_ids
        )
    course_rows.sort(
        key=lambda item: (item["date"], item["start_time"], item["id"]),
        reverse=True,
    )

    teacher_statistics = {
        teacher.id: {
            "id": teacher.id,
            "name": teacher.nickname or teacher.name or teacher.id,
            "course_count": 0,
            "class_hours": 0,
            "participant_count": 0,
            "transaction_amount": 0.0,
        }
        for teacher in teachers
    }
    for type_key in selected_types:
        for activity in selected_activities_by_type[type_key]:
            activity_hours = _course_activity_hours(type_key, activity)
            activity_participant_count = len(_course_participant_ids(type_key, activity))
            for activity_teacher_id in _course_activity_teacher_ids(activity):
                if activity_teacher_id not in teacher_statistics:
                    continue
                teacher_statistics[activity_teacher_id]["course_count"] += 1
                teacher_statistics[activity_teacher_id]["class_hours"] += activity_hours
                teacher_statistics[activity_teacher_id]["participant_count"] += activity_participant_count

    for transaction_teacher_id, amount in _teacher_transaction_amounts(
        teachers,
        date_from,
        date_to,
        payment_groups,
        {
            (activity_date, participant_id)
            for activity_date, participant_ids in filtered_participants_by_date.items()
            for participant_id in participant_ids
        } if activity_type == "class" else None,
    ).items():
        teacher_statistics[transaction_teacher_id]["transaction_amount"] = round(amount, 2)

    return {
        "date_from": date_from,
        "date_to": date_to,
        "granularity": granularity,
        "selected_activity_type": activity_type or "all",
        "activity_types": [
            {"value": key, "label": label}
            for key, label, _loader in COURSE_ACTIVITY_TYPES
        ],
        "organizations": [
            {"id": organization.id, "name": organization.name}
            for organization in organizations
        ],
        "teachers": [
            {
                "id": teacher.id,
                "name": teacher.nickname or teacher.name or teacher.id,
            }
            for teacher in teachers
        ],
        "statistics": statistics,
        "subtype_statistics": [
            {
                "type": subtype_name,
                "label": subtype_name,
                **subtype_totals[subtype_name],
            }
            for subtype_name in subtype_names
        ],
        "salon_subtype_statistics": [
            {
                "type": subtype_name,
                "label": subtype_name,
                **subtype_totals[subtype_name],
            }
            for subtype_name in subtype_names
        ] if activity_type == "class" else [],
        "trend": _course_trend_rows(trend_grouped, date_from, date_to, granularity),
        "teacher_statistics": sorted(
            teacher_statistics.values(),
            key=lambda item: (-item["course_count"], -item["class_hours"], item["name"]),
        ),
        "courses": course_rows,
    }


@router.get("/referrals")
def get_referral_statistics(
    date_from: str | None = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, description="结束日期 YYYY-MM-DD"),
    granularity: str = Query("day", description="聚合粒度: day/week/month"),
    referrer: str | None = Query(None, description="引流人昵称"),
    member_types: str | None = Query(None, description="会员类型筛选，逗号分隔多选"),
):
    """获取引流统计：跟进状态分布、变化趋势和人员明细。"""
    date_from, date_to = _get_date_range(date_from, date_to)
    type_filter = _parse_member_types(member_types)
    status_names = [status.value for status in FollowUpStatus]
    all_customers = customer_service.list_customers()
    # 引流人选项：只统计选定引流日期范围内有数据的引流人，按人数降序排列
    referrer_counts: dict[str, int] = defaultdict(int)
    for customer in all_customers:
        referral_date = (customer.referral_date or "").strip()
        if not referral_date:
            continue
        if not (date_from <= referral_date <= date_to):
            continue
        referrer_name = (customer.referrer or "").strip()
        if referrer_name:
            referrer_counts[referrer_name] += 1
    referrer_names = [
        name
        for name, _count in sorted(
            referrer_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]
    customers = [
        customer
        for customer in all_customers
        if (not referrer or (customer.referrer or "").strip() == referrer)
        and (not type_filter or (customer.member_type or "") in type_filter)
    ]

    customers_by_date: dict[str, dict[str, int]] = defaultdict(
        lambda: {status: 0 for status in status_names}
    )
    for customer in customers:
        status = getattr(customer.follow_up_status, "value", customer.follow_up_status) or FollowUpStatus.NEW.value
        if status not in status_names:
            status = FollowUpStatus.NEW.value
        referral_date = (customer.referral_date or "").strip()
        if not referral_date:
            continue
        customers_by_date[referral_date][status] += 1

    # 按引流日期范围过滤：只统计选定时间范围内引流的客户
    daily_new = {
        referral_date: values
        for referral_date, values in customers_by_date.items()
        if date_from <= referral_date <= date_to
    }
    status_totals = {status: 0 for status in status_names}
    for values in daily_new.values():
        for status in status_names:
            status_totals[status] += values.get(status, 0)
    cumulative_by_date: dict[str, dict[str, int]] = {}
    cumulative = {status: 0 for status in status_names}
    for referral_date in sorted(customers_by_date):
        for status in status_names:
            cumulative[status] += customers_by_date[referral_date].get(status, 0)
        if date_from <= referral_date <= date_to:
            if not cumulative_by_date:
                # 范围内第一天：重置累计，只统计范围内新增
                cumulative = {status: customers_by_date[referral_date].get(status, 0) for status in status_names}
            cumulative_by_date[referral_date] = dict(cumulative)

    members = []
    for customer in customers:
        # 按引流日期范围过滤：只保留选定时间范围内引流的客户
        referral_date = (customer.referral_date or "").strip()
        if not referral_date:
            continue
        if not (date_from <= referral_date <= date_to):
            continue
        stats = _get_customer_stats(customer.id, None, None)
        status = getattr(customer.follow_up_status, "value", customer.follow_up_status) or FollowUpStatus.NEW.value
        members.append({
            "id": customer.id,
            "nickname": customer.nickname or "",
            "referral_date": referral_date,
            "member_type": customer.member_type or "",
            "referrer": customer.referrer or "",
            "follow_up_status": status,
            "first_visit_date": stats.get("first_visit_date", "-"),
            "invited_count": stats.get("invited_count", 0),
            "visit_count": stats.get("visit_count", 0),
            "visit_interval": stats.get("visit_interval", "-"),
            "activity_count": stats.get("activity_count", 0),
            "total_consumption": stats.get("total_consumption", 0),
        })

    return {
        "total_people": sum(sum(v.values()) for v in daily_new.values()),
        "status_names": status_names,
        "status_totals": status_totals,
        "referrer_names": referrer_names,
        # 全量会员类型选项（不受会员类型筛选影响，避免选项塌缩）
        "member_type_names": _sort_member_type_names(
            {c.member_type or "" for c in all_customers}
        ),
        "chart_new": _aggregate_member_by_granularity(
            daily_new, granularity, date_from, date_to, status_names
        ),
        "chart_total": _aggregate_member_cumulative(
            cumulative_by_date, granularity, date_from, date_to, status_names
        ),
        "members": members,
    }
