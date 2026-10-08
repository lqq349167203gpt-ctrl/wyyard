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


def detail_page(breakdown: dict, query) -> dict:
    customers = selected_customers(breakdown, query.detail_picks)
    if query.overview_detail == "traffic":
        rows = traffic_quick_filter(customers, query.detail_quick_filter)
    elif query.overview_detail == "invite_arrivals":
        customers = [row for row in customers if row.get("arrive_count") or row.get("arrive_date")]
        rows = ([{**row, **record, "id": row["id"], "arrival_id": record["id"]}
                 for row in customers for record in row.get("arrival_records", [])]
                if query.arrival_view == "date" else customers)
    else:
        group = next((group for group in breakdown.get("invite_inviters", [])
                      if group["key"] == query.overview_detail_key), None)
        rows = group.get("records", []) if group else []
    if query.detail_sort_by:
        rows = sort_rows(rows, query.detail_sort_by, query.detail_sort_order)
    elif query.overview_detail == "invite_arrivals":
        from app.services.principal_service import _collate

        rows = sorted(rows, key=lambda row: _collate(row.get("name", "")))
        rows.sort(key=lambda row: row.get("arrive_date", ""), reverse=True)
    # 不排序的引流列表和发起邀约沿用分析结果的既定顺序。
    total = len(rows)
    pages = max(1, ceil(total / query.page_size))
    page = min(query.page, pages)
    selected = rows[(page - 1) * query.page_size:page * query.page_size]
    return {"items": [{key: value for key, value in row.items() if key != "arrival_records"} for row in selected],
            "total": total, "page": page, "page_size": query.page_size, "total_pages": pages}
