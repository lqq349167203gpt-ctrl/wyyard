"""完整购买、上课历史及阶段目标计算，供业务分类共用。"""
from datetime import date

from app.services import storage
from app.services.course_workflow_guard_service import SOURCES

PAYMENT_PROJECT_TYPES = {
    "membership": "membership-cards",
    "group_case": "group-cases",
    "emotional": "emotional-releases",
    "energy": "energy-knots",
    "oh": "oh-card-readings",
    "internal": "internal-courses",
    "other": "other-projects",
    "tea": "tea-seat-fees",
    "online_tea": "online-tea",
    "companion_camp": "companion-camps",
    "offline": "offline-courses",
}



def all_orders(*, include_inactive=False):
    """复用现有产品映射和购买分类，过滤退费；订单日期不推测。"""
    from app.services import principal_service, project_deduction_service, project_refund_service

    rows = []

    for product, label, loader, subtype_field in principal_service.PRODUCTS:
        if include_inactive:
            from app.services.financial_detail_service import PRODUCT_FILES
            filename = next(name for name, kind in PRODUCT_FILES.items() if kind == product)
            records = storage.load_data(filename).values()
        else:
            records = loader()
        for record in records:
            row = dict(record) if isinstance(record, dict) else record.model_dump(mode="json")
            if not include_inactive and (row.get("is_deleted") or row.get("card_type") == "粗门次卡"):
                continue
            identifier = row["id"]
            invalid = row.get("is_deleted") or row.get("voided") or project_refund_service.is_project_refunded(PAYMENT_PROJECT_TYPES[product], identifier)
            rows.append(
                {
                    **row,
                    "id": f"{product}:{identifier}",
                    "record_id": identifier,
                    "kind": "purchase",
                    "product": product,
                    "label": label,
                    "subtype": row.get(subtype_field, "") if subtype_field else "",
                    "date": row.get("deal_date") or "",
                    "recorded_at": row.get("created_at", ""),
                    "invalid": bool(invalid),
                    "quantity": row.get("purchase_count", row.get("total_count", row.get("quantity", 1))),
                }
            )
    for record in project_deduction_service.list_deductions(include_cancelled=True):
        if record.project_name != "粗门次卡" or not record.source_activity_id or record.is_deleted:
            continue
        row = record.model_dump(mode="json")
        source = next((source for source, kind in SOURCES.items() if kind == record.source_activity_type), "")
        rows.append(
            {
                **row,
                "id": f"coarse:{record.id}",
                "record_id": record.id,
                "kind": "coarse_usage",
                "product": "coarse",
                "subtype": "",
                "label": "粗门次卡",
                "date": record.deduction_date,
                "deal_date": record.deduction_date,
                "recorded_at": row["created_at"],
                "invalid": record.cancelled,
                "deal_course_key": f"{source}:{record.source_activity_id}",
                "quantity": record.count,
            }
        )
    return rows



def stage_events():
    """分类专用历史：实际上课可形成体验，但不进入订单或财务明细。"""
    from app.api.statistics import COURSE_ACTIVITY_TYPES, _course_participant_ids
    from app.services import course_attendance_service, visit_service

    events = all_orders()
    confirmations = course_attendance_service.snapshot()
    arrivals = visit_service.get_arrived_customer_ids_by_date()
    for kind, _, loader in COURSE_ACTIVITY_TYPES:
        for record in loader():
            if record.is_deleted:
                continue
            confirmed = course_attendance_service.attended_ids(
                kind, record.id, arrivals.get(record.date, set()), record=record, confirmations=confirmations,
            )
            participants = _course_participant_ids(kind, record) & confirmed
            for cid in sorted(participants):
                events.append({
                    "id": f"attendance:{kind}:{record.id}:{cid}", "kind": "attendance", "product": kind,
                    "subtype": (getattr(record, "course_type", "") or "").strip(),
                    "is_public_welfare": getattr(record, "is_public_welfare", False),
                    "customer_id": cid, "date": record.date, "invalid": False,
                })
    return events



def active_events(orders, until):
    result = []
    for row in orders:
        try:
            day = date.fromisoformat(row["date"])
        except (ValueError, TypeError):
            continue
        if not row["invalid"] and day.isoformat() <= until:
            result.append(dict(row))
    return result



def _target(events, rules, cid, day):
    """通过现有引擎模拟下一笔，判断客户确有可达目标，不按卡名/金额猜阶段。"""
    from app.services.upsell_config_service import classify_purchases, parse_item

    history = [e for e in events if e["customer_id"] == cid and e["date"] <= day]
    classified = [dict(e) for e in history]
    classify_purchases(classified, rules)
    stages = {key for e in classified if e["date"] < day for key in e.get("purchase_rule_keys", [])}
    # 按配置尝试可达的后续目标；已转化客户不再退回转化目标。
    keys = ["repurchase", "upsell"] if stages & {"upsell", "repurchase"} else ["upsell"] if "conversion" in stages else ["upsell", "conversion"]
    candidates = [r for key in keys for r in rules if r["key"] == key and r.get("conditions")]
    if not candidates:
        return "", "没有配置适用的转化或升单目标"
    for rule in candidates:
        for condition in rule["conditions"]:
            for item in condition.get("products") or [condition.get("product", "")]:
                product, subtype = parse_item(item)
                probe = {
                    "id": "workflow-probe", "kind": "purchase", "product": product, "subtype": subtype,
                    "date": day, "deal_date": day, "recorded_at": "9999", "customer_id": cid,
                }
                simulated = [dict(e) for e in history] + [probe]
                classify_purchases(simulated, rules)
                if rule["key"] in probe.get("purchase_rule_keys", []):
                    return rule["key"], ""
    return "none", ""
