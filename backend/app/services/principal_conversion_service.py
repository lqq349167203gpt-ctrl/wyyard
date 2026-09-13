"""纯计算转化引擎：只接收经过组织/客户权限过滤的事件，不读取业务库。"""

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.models.principal import ConversionAction, ConversionRule


def _analysis():
    """延迟导入：保持本模块不依赖业务库，只在真的用了条件时加载。"""
    from app.services import custom_analysis_service

    return custom_analysis_service


def matches(event: dict, action: ConversionAction) -> bool:
    return (
        event["kind"] == action.kind
        and (not action.product or event["product"] == action.product)
        and (not action.subtype or event["subtype"] == action.subtype)
    )


def select_events(events: list[dict], action: ConversionAction) -> list[dict]:
    matching = sorted((e for e in events if matches(e, action)), key=lambda e: (e["date"], e["id"]))
    # 首次按该规则选择的产品范围判定；同日多单无法证明先后，均视作首购日。
    first_dates: dict[str, str] = {}
    result = []
    for event in matching:
        first = first_dates.setdefault(event["customer_id"], event["date"])
        is_first = event["date"] == first
        if action.occurrence == "any" or (action.occurrence == "first" and is_first) or (action.occurrence == "repeat" and not is_first):
            result.append(event)
    return result


def calculate_conversion(events: list[dict], rule: ConversionRule, source_orgs: set[str],
                         date_from: str, date_to: str, today: date | None = None,
                         customer_rows: dict[str, dict] | None = None) -> dict:
    today = today or datetime.now(ZoneInfo("Asia/Shanghai")).date()
    events = [e for e in events if e["date"] <= today.isoformat()]
    sources = select_events(events, rule.source)
    targets = [select_events(events, action) for action in rule.targets]
    rows_by_customer = customer_rows or {}

    def source_ok(customer_id: str) -> bool:
        """「从」上的条件用来筛人：客户档案不满足就不进这批人。"""
        if not rule.source.conditions:
            return True
        row = rows_by_customer.get(customer_id) or {}
        return all(_analysis().matches_condition(row, condition) for condition in rule.source.conditions)

    target_maps = []
    for group in targets:
        by_person = defaultdict(list)
        for event in group:
            by_person[event["customer_id"]].append(event)
        target_maps.append(by_person)
    # 每人取区间内第一个符合条件起点，避免同一人重复扩大分母。
    cohort = {}
    for event in sources:
        if (event["organization_id"] in source_orgs and date_from <= event["date"] <= date_to
                and source_ok(event["customer_id"])):
            cohort.setdefault(event["customer_id"], event)
    rows = []
    unique_targets = set()
    for customer_id, source in cohort.items():
        deadline = date.fromisoformat(source["date"]) + timedelta(days=rule.window_days)
        hits = []
        for group in target_maps:
            hits.append([
                event for event in group.get(customer_id, [])
                if event["id"] != source["id"]
                and source["date"] <= event["date"] <= min(deadline, today).isoformat()
                and (not rule.same_organization or event["organization_id"] == source["organization_id"])
            ])
        converted = all(hits) if rule.target_mode == "all" else any(hits)
        matched = {event["id"]: event for group in hits for event in group}
        if converted:
            unique_targets.update(e["id"] for e in matched.values() if e["kind"] == "purchase")
        # 截止日当天尚未结束，完整观察期统计从次日起纳入。
        mature = deadline < today
        status = "converted" if converted else "unconverted" if mature else "observing"
        evidence = [source, *sorted(matched.values(), key=lambda e: (e["date"], e["id"]))]
        rows.append({
            "id": customer_id, "customer_id": customer_id, "customer": source["customer"], "date": source["date"],
            "organization": source["organization"], "source": source["label"],
            "deadline": deadline.isoformat(), "status": status,
            "status_label": {"converted": "已转化", "unconverted": "未转化", "observing": "观察中"}[status],
            "target_count": len(matched), "mature": mature,
            "same_day": "同日转化（不代表因果）" if converted and any(e["date"] == source["date"] for e in matched.values()) else "",
            "details": [f'{"起点" if index == 0 else "目标"}｜{e["date"]}｜{e["label"]}｜{e["organization"]}' for index, e in enumerate(evidence)],
        })
    converted_count = sum(r["status"] == "converted" for r in rows)
    mature_count = sum(r["mature"] for r in rows)
    mature_converted = sum(r["mature"] and r["status"] == "converted" for r in rows)
    return {"items": rows, "summary": {
        "符合条件人数": len(rows), "转化人数": converted_count,
        "转化率": f"{converted_count / len(rows) * 100:.1f}%" if rows else "—",
        "转化成交笔数": len(unique_targets),
        "观察中": sum(r["status"] == "observing" for r in rows),
        "观察已完成人数": mature_count,
        "完整观察期转化率": f"{mature_converted / mature_count * 100:.1f}%" if mature_count else "—",
    }}
