"""组织/俱乐部小程序视图：统计口径复用主理人分析，只向手机发送当前页。"""

from collections import Counter

NUMERIC_SORT_FIELDS = {
    "deals", "invite_count", "initiated_count", "cancel_count", "no_show_count",
    "arrive_count", "activity_count", "same_day_deals", "visit_interval",
}


def _sort_value(row: dict, field: str):
    value = row.get(field)
    if field in NUMERIC_SORT_FIELDS:
        try:
            return float(str(value or 0).removesuffix("天"))
        except (TypeError, ValueError):
            return 0.0
    if isinstance(value, list):
        return "、".join(str(item) for item in value)
    return str(value or "")


def selected_customers(breakdown: dict, picks: list[str]) -> list[dict]:
    selected = {}
    for pick in picks:
        prefix, _, value = pick.partition(":")
        selected.setdefault(prefix, set()).add(value)
    rows = []
    for group in breakdown.get("traffic", []):
        for customer in group.get("customers", []):
            row = {**customer, "referrer": group["label"]}
            if selected.get("traffic") and row["referrer"] not in selected["traffic"]:
                continue
            if selected.get("identity") and row.get("identity", "") not in selected["identity"]:
                continue
            if selected.get("stage") and row.get("follow_up_status", "") not in selected["stage"]:
                continue
            if selected.get("source") and row.get("traffic_source", "") not in selected["source"]:
                continue
            if selected.get("tag") and not selected["tag"].intersection(row.get("tags") or []):
                continue
            if selected.get("inviter") and not selected["inviter"].intersection(row.get("inviters") or []):
                continue
            levels = row.get("upsell_levels") or []
            if selected.get("upsell") and (not levels or levels[-1]["key"] not in selected["upsell"]):
                continue
            rows.append(row)
    return rows


def traffic_quick_filter(rows: list[dict], quick: str) -> list[dict]:
    if not quick:
        return rows
    filtered = []
    for row in rows:
        if quick in {"initiated", "invite", "cancel", "no_show", "arrive"} and row["referrer"] == "未配置":
            continue
        if quick == "deals":
            keep = int(row.get("deals") or 0) > 0
        elif quick.startswith("product:"):
            keep = any(product.get("key") == quick[8:] for product in row.get("products") or [])
        else:
            field = {"initiated": "initiated_count", "invite": "invite_count", "cancel": "cancel_count",
                     "no_show": "no_show_count", "arrive": "arrive_count"}.get(quick)
            keep = field is None or int(row.get(field) or 0) > 0
        if keep:
            filtered.append(row)
    return filtered


def _small_customer(row: dict) -> dict:
    return {key: ("、".join(value) if key == "tags" and isinstance(value, list) else value)
            for key, value in row.items()
            if key not in {"products", "subtypes", "upsell_levels", "arrival_records", "inviters"}}


def mobile_result(result: dict, query) -> dict:
    """沿用同一次分析所得全量统计，按手机当前板块裁剪网络响应。"""
    breakdown = result.get("breakdown") or {}
    picks = query.breakdown or []
    customers = selected_customers(breakdown, picks)
    inviters = breakdown.get("invite_inviters") or []
    products = Counter()
    levels = Counter()
    for customer in customers:
        for product in customer.get("products") or []:
            products[(product["key"], product["label"])] += int(product.get("count") or 0)
        for level in customer.get("upsell_levels") or []:
            levels[level["key"]] += 1
    selected_inviters = {pick.partition(":")[2] for pick in picks if pick.startswith("inviter:")}
    chosen_inviters = [item for item in inviters if not selected_inviters or item["key"] in selected_inviters]
    mobile = {
        "traffic_count": len(customers),
        "traffic_deals": sum(int(row.get("deals") or 0) for row in customers),
        "traffic_products": [{"key": key, "label": label, "count": count}
                             for (key, label), count in products.most_common()],
        "traffic_levels": [{**level, "count": levels[level["key"]]}
                           for level in breakdown.get("traffic_upsell_levels") or []] if any(key == "membership" for key, _ in products) else [],
        "invite": {
            key: {"times": sum(int(row.get(key) or 0) for row in customers),
                  "people": sum(int(row.get(key) or 0) > 0 for row in customers)}
            for key in ("invite_count", "cancel_count", "no_show_count", "arrive_count")
        },
        "initiated_times": sum(int(group.get("initiated_count") or 0) for group in chosen_inviters),
        "initiated_people": len({record.get("customer_id") for group in chosen_inviters
                                 for record in group.get("records") or [] if record.get("customer_id")}),
    }
    mobile["invite_total"] = sum(mobile["invite"][key]["times"] for key in ("cancel_count", "no_show_count", "arrive_count"))
    mobile["invite_people"] = sum(int(row.get("invite_count") or 0) > 0 for row in customers)
    compact_traffic = []
    for group in breakdown.get("traffic") or []:
        group_customers = group.get("customers") or []
        consumers = [row for row in group_customers if int(row.get("deals") or 0) > 0]
        first_level = (breakdown.get("traffic_upsell_levels") or [{}])[0].get("key")
        compact_traffic.append({key: value for key, value in group.items() if key != "customers"} | {
            "trial_count": sum(len(row.get("upsell_levels") or []) == 1 and row["upsell_levels"][0]["key"] == first_level
                               for row in group_customers) if first_level else 0,
            "consumer_count": len(consumers),
            "upsell_count": sum(bool(row.get("is_upsell")) for row in consumers),
        })
    compact_breakdown = {**breakdown, "traffic": compact_traffic,
                         "invite_inviters": [{key: value for key, value in item.items() if key != "records"}
                                             for item in inviters]}
    group = query.mobile_group
    if group == "traffic":
        rows = traffic_quick_filter(customers, query.mobile_quick_filter)
    elif group == "invite_arrive":
        rows = [row for row in customers if int(row.get("arrive_count") or 0) > 0]
        if query.arrival_view == "date":
            rows = [{**row, "customer_id": row["id"], **record}
                    for row in rows for record in row.get("arrival_records") or []]
        else:
            rows = [{**row, "customer_id": row["id"]} for row in rows]
    elif group == "invite_initiated":
        rows = [{**item, "id": f"inviter:{item['key']}", "name": item["label"]} for item in chosen_inviters]
    else:
        rows = result.get("items") or []
    if group in {"traffic", "invite_arrive", "invite_initiated"}:
        if query.sort_by:
            rows.sort(key=lambda row: _sort_value(row, query.sort_by), reverse=query.sort_order == "desc")
        elif group == "invite_arrive":
            rows.sort(key=lambda row: str(row.get("arrive_date") or ""), reverse=True)
        total = len(rows)
        start = (query.page - 1) * query.page_size
        rows = rows[start:start + query.page_size]
        if group == "invite_initiated":
            rows = [{key: value for key, value in row.items() if key != "records"} for row in rows]
        else:
            rows = [_small_customer(row) for row in rows]
    else:
        total = result["total"]
    if query.mobile_detail_key and group == "invite_initiated":
        found = next((item for item in chosen_inviters if item["key"] == query.mobile_detail_key), None)
        records = found.get("records") or [] if found else []
        start = (query.page - 1) * query.page_size
        mobile["detail_records"] = records[start:start + query.page_size]
        mobile["detail_total"] = len(records)
    return {**result, "breakdown": compact_breakdown, "items": rows, "total": total,
            "page": query.page, "mobile": mobile}
