"""组织统计响应裁剪：完整统计留在缓存，明细排序后只复制当前页。"""

from math import ceil

from app.services.principal_mobile_service import _sort_value, selected_customers, traffic_quick_filter


def sort_rows(rows: list[dict], field: str, order: str) -> list[dict]:
    """列表与导出共用整批排序，数字按数值、中文按已有拼音规则排序。"""
    if not field:
        return rows
    from app.services.principal_service import _collate

    status_order = {"cancelled": 0, "no_show": 1, "arrived": 2}

    def value(row):
        if field == "status_label":
            return status_order.get(row.get("status"), 99)
        item = _sort_value(row, field)
        return _collate(item) if isinstance(item, str) else item

    return sorted(rows, key=value, reverse=order == "desc")


def _participation_rows(breakdown: dict, query) -> list[dict]:
    """从已授权的组织成员中筛选逐场参与记录，整批排序后再分页。"""
    selected = {}
    for pick in query.detail_picks or query.breakdown:
        prefix, _, value = pick.partition(":")
        selected.setdefault(prefix, set()).add(value)
    rows = []
    for member in breakdown.get("participation", {}).get("members", []):
        if selected.get("participation_person") and member["id"] not in selected["participation_person"]:
            continue
        records = [record for record in member["activities"]
                   if (not selected.get("participation_type") or record["activity_type"] in selected["participation_type"])
                   and (not selected.get("participation_course") or record["course_key"] in selected["participation_course"])]
        if not records:
            continue
        owner_count = sum(record["role"] == "案主" for record in records)
        rows.append({"id": member["id"], "name": member["name"], "count": len(records),
                     "owner_count": owner_count, "participant_count": len(records) - owner_count,
                     "activities": [{"date": record["date"], "name": record["name"], "type": record["type"],
                                     "subtype": record.get("subtype", ""), "role": record["role"],
                                     "teachers": record.get("teachers", "")} for record in records]})
    return rows


def _arrival_date_groups(customers: list[dict]) -> list[dict]:
    """按预计到店日期归组，含已到店、未到店和已取消。分页按天切，同一天不会拆到两页。"""
    from app.services.principal_service import _collate

    grouped: dict[str, list[dict]] = {}
    for row in customers:
        records = row.get("invite_visits")
        if records is None:
            records = row.get("arrival_records") or []
        for record in records:
            day = record.get("arrive_date") or ""
            if not day:
                continue
            grouped.setdefault(day, []).append({
                "id": record.get("id") or "",
                "customer_id": row.get("id") or "",
                "name": row.get("name") or "",
                "arrive_time": record.get("arrive_time") or "",
                "arrive_inviter": record.get("arrive_inviter") or "",
                "needs": record.get("needs") or "",
                "same_day_activities": record.get("same_day_activities") or "",
                "same_day_deal_text": record.get("same_day_deal_text") or "",
                "status": record.get("status") or "arrived",
                "status_label": record.get("status_label") or "已到店",
            })
    rows = []
    for day in sorted(grouped, reverse=True):
        records = sorted(grouped[day], key=lambda item: (
            not item["arrive_time"], item["arrive_time"], _collate(item["name"]), item["id"]))
        rows.append({"id": day, "date": day, "count": len(records), "records": records})
    return rows


def detail_page(breakdown: dict, query) -> dict:
    customers = selected_customers(breakdown, query.detail_picks,
                                   source="invite_traffic" if query.overview_detail == "invite_arrivals" else "traffic")
    if query.overview_detail == "participation":
        rows = _participation_rows(breakdown, query)
    elif query.overview_detail == "traffic":
        rows = traffic_quick_filter(customers, query.detail_quick_filter)
    elif query.overview_detail == "invite_arrivals":
        if query.arrival_view == "date_group":
            rows = _arrival_date_groups(customers)
        else:
            customers = [row for row in customers if row.get("arrive_count") or row.get("arrive_date")]
            rows = ([{**row, **record, "id": row["id"], "arrival_id": record["id"]}
                     for row in customers for record in row.get("arrival_records", [])]
                    if query.arrival_view == "date" else customers)
    else:
        group = next((group for group in breakdown.get("invite_inviters", [])
                      if group["key"] == query.overview_detail_key), None)
        rows = group.get("records", []) if group else []
    if query.overview_detail == "participation":
        from app.services.principal_service import _collate

        rows = sorted(rows, key=lambda row: (-row["count"], _collate(row["name"]), row["id"]))
    elif query.detail_sort_by:
        rows = sort_rows(rows, query.detail_sort_by, query.detail_sort_order)
    elif query.overview_detail == "invite_arrivals" and query.arrival_view != "date_group":
        from app.services.principal_service import _collate

        rows = sorted(rows, key=lambda row: _collate(row.get("name", "")))
        rows.sort(key=lambda row: row.get("arrive_date", ""), reverse=True)
    # 不排序的引流列表和发起邀约沿用分析结果的既定顺序。
    total = len(rows)
    pages = max(1, ceil(total / query.page_size))
    page = min(query.page, pages)
    selected = rows[(page - 1) * query.page_size:page * query.page_size]
    hidden = {"arrival_records", "invite_visits"}
    return {"items": [{key: value for key, value in row.items() if key not in hidden} for row in selected],
            "total": total, "page": page, "page_size": query.page_size, "total_pages": pages}
