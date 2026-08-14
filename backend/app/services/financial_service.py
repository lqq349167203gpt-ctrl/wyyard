from collections import defaultdict

from app.services import expense_service, financial_record_service, project_refund_service
from app.services.payment_export_service import PROJECT_SOURCES, _amount


def _record_date(item: dict) -> str:
    return (item.get("deal_date") or str(item.get("created_at") or "")[:10])[:10]


def _detail_name(item: dict, project_type: str, type_label: str) -> str:
    if project_type == "membership_card":
        return item.get("card_type") or "未命名会员卡"
    if project_type == "internal_course":
        return item.get("course_type") or type_label
    if project_type == "other":
        return item.get("category") or item.get("project_name") or type_label
    return type_label


def _closer_names(item: dict) -> list[str]:
    names = [str(closer.get("name") or "").strip() for closer in item.get("closers") or []]
    names = [name for name in names if name]
    if not names and item.get("closer_name"):
        names = [str(item["closer_name"]).strip()]
    return names


def _closer_details(item: dict, amount: float) -> list[dict]:
    details = [
        {
            "name": str(closer.get("name") or "").strip(),
            "amount": round(float(closer.get("amount") or 0), 2),
        }
        for closer in item.get("closers") or []
        if str(closer.get("name") or "").strip()
    ]
    if not details and item.get("closer_name"):
        details = [{"name": str(item["closer_name"]).strip(), "amount": round(amount, 2)}]
    return details


def _quantity_label(item: dict, project_type: str) -> str:
    if project_type == "membership_card":
        total_count = item.get("total_count")
        return "不限" if total_count is None else f"{total_count}次"
    if project_type in {"group_case", "emotional_release"}:
        return f"{item.get('purchase_count') or 0}次"
    if project_type == "energy_knot":
        return f"{item.get('purchase_count') or 0}个"
    if project_type == "oh_card_reading":
        return f"{(item.get('diagnosis_duration') or 1) * 0.5:g}小时"
    if project_type == "tea_seat_fee":
        return f"{item.get('quantity') or 1}位"
    if project_type == "offline_course":
        unit = "天" if item.get("validity_unit") == "day" else "个月"
        return f"{item.get('validity_value') or 1}{unit}"
    if project_type == "other":
        total_count = item.get("total_count")
        return "不限" if total_count is None else f"{total_count}次"
    return ""


def get_overview(date_from: str, date_to: str) -> dict:
    group_rows: dict[str, dict] = defaultdict(
        lambda: {"revenue": 0.0, "deal_count": 0, "customer_ids": set(), "closers": set()}
    )
    custom_rows: dict[str, dict] = defaultdict(
        lambda: {"revenue": 0.0, "deal_count": 0, "customer_ids": set(), "closers": set()}
    )

    for project_type, type_label, list_records in PROJECT_SOURCES:
        target = group_rows if project_type == "membership_card" else custom_rows
        for record in list_records():
            item = record.model_dump(mode="json")
            record_date = _record_date(item)
            if not record_date or not date_from <= record_date <= date_to:
                continue
            name = _detail_name(item, project_type, type_label)
            target[name]["revenue"] += _amount(item, project_type)
            target[name]["deal_count"] += 1
            customer_key = item.get("customer_id") or item.get("nickname")
            if customer_key:
                target[name]["customer_ids"].add(customer_key)
            target[name]["closers"].update(_closer_names(item))

    def build_breakdown(rows: dict[str, dict]) -> tuple[float, list[dict]]:
        total = sum(float(row["revenue"]) for row in rows.values())
        details = [
            {
                "name": name,
                "revenue": round(float(row["revenue"]), 2),
                "revenue_share": round(float(row["revenue"]) / total * 100, 2) if total else 0,
                "deal_count": int(row["deal_count"]),
                "customer_count": len(row["customer_ids"]),
                "closers": sorted(row["closers"]),
            }
            for name, row in rows.items()
        ]
        details.sort(key=lambda row: (-row["revenue"], row["name"]))
        return round(total, 2), details

    group_revenue, group_breakdown = build_breakdown(group_rows)
    custom_revenue, custom_breakdown = build_breakdown(custom_rows)
    expenses = expense_service.list_expenses(date_from, date_to)
    management_cost = round(sum(item.amount for item in expenses if item.cost_category == "management"), 2)
    operation_cost = round(sum(item.amount for item in expenses if item.cost_category == "operation"), 2)
    month_from = date_from[:7]
    month_to = date_to[:7]
    commission_total = round(
        sum(
            item.amount
            for item in financial_record_service.list_commissions()
            if month_from <= item.month <= month_to
        ),
        2,
    )
    staff_benefit_total = round(
        sum(item.amount for item in financial_record_service.list_benefits(date_from, date_to)),
        2,
    )
    refund_total = round(
        sum(
            item.refund_amount
            for item in project_refund_service.list_refunds()
            if date_from <= item.refund_date <= date_to
        ),
        2,
    )
    total_revenue = round(group_revenue + custom_revenue, 2)
    total_expense = round(management_cost + operation_cost, 2)
    operating_profit = round(
        total_revenue - total_expense - commission_total - staff_benefit_total - refund_total,
        2,
    )
    return {
        "date_from": date_from,
        "date_to": date_to,
        "total_revenue": total_revenue,
        "management_cost": management_cost,
        "operation_cost": operation_cost,
        "total_expense": total_expense,
        "commission_total": commission_total,
        "staff_benefit_total": staff_benefit_total,
        "refund_total": refund_total,
        "operating_profit": operating_profit,
        "net_profit": None,
        "group_class_revenue": group_revenue,
        "custom_course_revenue": custom_revenue,
        "group_class_breakdown": group_breakdown,
        "custom_course_breakdown": custom_breakdown,
    }


def list_revenue_details(date_from: str, date_to: str, category: str, name: str) -> list[dict]:
    details = []
    for project_type, type_label, list_records in PROJECT_SOURCES:
        is_group = project_type == "membership_card"
        if (category == "group") != is_group:
            continue
        for record in list_records():
            item = record.model_dump(mode="json")
            record_date = _record_date(item)
            if not record_date or not date_from <= record_date <= date_to:
                continue
            if _detail_name(item, project_type, type_label) != name:
                continue
            amount = _amount(item, project_type)
            details.append({
                "id": str(item.get("id") or ""),
                "deal_date": record_date,
                "nickname": item.get("nickname") or item.get("customer_id") or "",
                "type": type_label,
                "name": _detail_name(item, project_type, type_label),
                "quantity": _quantity_label(item, project_type),
                "amount": round(amount, 2),
                "closers": _closer_details(item, amount),
                "notes": item.get("notes") or "",
                "_created_at": str(item.get("created_at") or ""),
            })
    details.sort(key=lambda row: (row["deal_date"], row["_created_at"]), reverse=True)
    for detail in details:
        detail.pop("_created_at", None)
    return details


def list_composition_details(date_from: str, date_to: str, kind: str) -> list[dict]:
    if kind == "expense":
        category_labels = {"management": "管理成本", "operation": "运营成本"}
        return [
            {
                "id": item.id,
                "kind": kind,
                "date": item.expense_time[:10],
                "primary": category_labels.get(item.cost_category, "未分类"),
                "secondary": item.expense_type or item.purchase_content,
                "content": item.purchase_content,
                "amount": round(item.amount, 2),
                "platform": item.platform,
                "notes": item.notes,
                "operator": item.created_by,
            }
            for item in expense_service.list_expenses(date_from, date_to)
        ]
    if kind == "commission":
        month_from = date_from[:7]
        month_to = date_to[:7]
        return [
            {
                "id": item.id,
                "kind": kind,
                "date": item.month,
                "primary": item.person_name,
                "secondary": "人员分成",
                "content": "",
                "amount": round(item.amount, 2),
                "platform": "",
                "notes": item.notes,
                "operator": item.created_by,
            }
            for item in financial_record_service.list_commissions()
            if month_from <= item.month <= month_to
        ]
    if kind == "benefit":
        return [
            {
                "id": item.id,
                "kind": kind,
                "date": item.benefit_date,
                "primary": item.content,
                "secondary": "人员福利",
                "content": item.content,
                "amount": round(item.amount, 2),
                "platform": "",
                "notes": item.notes,
                "operator": item.created_by,
            }
            for item in financial_record_service.list_benefits(date_from, date_to)
        ]
    return [
        {
            "id": item.id,
            "kind": "refund",
            "date": item.refund_date,
            "primary": item.nickname,
            "secondary": item.project_name,
            "content": item.project_type,
            "amount": round(item.refund_amount, 2),
            "paid_amount": round(item.paid_amount, 2),
            "platform": "",
            "notes": "",
            "operator": item.created_by,
        }
        for item in project_refund_service.list_refunds()
        if date_from <= item.refund_date <= date_to
    ]
