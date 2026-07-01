"""消费记录聚合 API — 付费记录 + 销卡记录"""
from fastapi import APIRouter, Query
from app.utils.pagination import paginate
from app.services import (
    membership_card_service,
    group_case_service,
    emotional_release_service,
    energy_knot_service,
    internal_course_service,
    oh_card_reading_service,
    other_project_service,
    project_deduction_service,
    other_project_deduction_service,
)

router = APIRouter(prefix="/api/consumption-records", tags=["consumption-records"])


@router.get("/daily-totals")
def get_daily_payment_totals(date: str = Query(...)):
    """返回指定日期各客户的成交总额 {customer_id: total_amount}"""
    totals: dict[str, float] = {}

    # 会员活动
    for c in membership_card_service.list_cards():
        if c.deal_date == date:
            totals[c.customer_id] = totals.get(c.customer_id, 0) + c.price

    # 觉醒游戏
    for c in group_case_service.list_cases():
        if c.deal_date == date:
            totals[c.customer_id] = totals.get(c.customer_id, 0) + c.amount

    # 情绪释放
    for r in emotional_release_service.list_releases():
        if r.deal_date == date:
            totals[r.customer_id] = totals.get(r.customer_id, 0) + r.amount

    # 能量结
    for k in energy_knot_service.list_knots():
        if k.deal_date == date:
            totals[k.customer_id] = totals.get(k.customer_id, 0) + k.amount

    # 内部课程
    for c in internal_course_service.list_courses():
        if c.deal_date == date:
            totals[c.customer_id] = totals.get(c.customer_id, 0) + c.price

    # OH卡梳理
    for r in oh_card_reading_service.list_readings():
        if r.deal_date == date:
            totals[r.customer_id] = totals.get(r.customer_id, 0) + r.amount

    # 其他项目
    for p in other_project_service.list_projects():
        if p.deal_date == date:
            totals[p.customer_id] = totals.get(p.customer_id, 0) + p.fee

    return totals


TYPE_LABELS = {
    "membership-cards": "会员活动",
    "group-cases": "觉醒游戏",
    "emotional-releases": "情绪释放",
    "oh-card-readings": "OH卡梳理",
    "energy-knots": "能量结",
}


@router.get("/payments")
def list_payment_records(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    records = []

    # 会员活动
    for c in membership_card_service.list_cards():
        created = c.created_at.strftime("%Y-%m-%d") if hasattr(c.created_at, "strftime") else str(c.created_at)
        records.append({
            "date": c.deal_date or "",
            "nickname": "",
            "type": "会员活动",
            "name": c.card_type,
            "quantity": 1,
            "amount": c.price,
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "customer_id": c.customer_id,
        })

    # 觉醒游戏
    for c in group_case_service.list_cases():
        created = c.created_at.strftime("%Y-%m-%d") if hasattr(c.created_at, "strftime") else str(c.created_at)
        records.append({
            "date": c.deal_date or "",
            "nickname": "",
            "type": "觉醒游戏",
            "name": "觉醒游戏",
            "quantity": c.purchase_count,
            "amount": c.amount,
            "effective_date": created,
            "expiry_date": "",
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "customer_id": c.customer_id,
        })

    # 情绪释放
    for r in emotional_release_service.list_releases():
        created = r.created_at.strftime("%Y-%m-%d") if hasattr(r.created_at, "strftime") else str(r.created_at)
        records.append({
            "date": r.deal_date or "",
            "nickname": "",
            "type": "情绪释放",
            "name": "情绪释放",
            "quantity": r.purchase_count,
            "amount": r.amount,
            "effective_date": created,
            "expiry_date": "",
            "closer_name": ", ".join(cl["name"] for cl in r.closers) if r.closers else (r.closer_name or ""),
            "customer_id": r.customer_id,
        })

    # 能量结
    for k in energy_knot_service.list_knots():
        created = k.created_at.strftime("%Y-%m-%d") if hasattr(k.created_at, "strftime") else str(k.created_at)
        records.append({
            "date": k.deal_date or "",
            "nickname": "",
            "type": "能量结",
            "name": "能量结",
            "quantity": k.purchase_count,
            "amount": k.amount,
            "effective_date": created,
            "expiry_date": "",
            "closer_name": ", ".join(cl["name"] for cl in k.closers) if k.closers else (k.closer_name or ""),
            "customer_id": k.customer_id,
        })

    # 内部课程
    for c in internal_course_service.list_courses():
        created = c.created_at.strftime("%Y-%m-%d") if hasattr(c.created_at, "strftime") else str(c.created_at)
        records.append({
            "date": c.deal_date or "",
            "nickname": "",
            "type": "内部课程",
            "name": c.course_type,
            "quantity": 1,
            "amount": c.price,
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "customer_id": c.customer_id,
        })

    # OH卡梳理
    for r in oh_card_reading_service.list_readings():
        created = r.created_at.strftime("%Y-%m-%d") if hasattr(r.created_at, "strftime") else str(r.created_at)
        records.append({
            "date": r.deal_date or "",
            "nickname": "",
            "type": "OH卡梳理",
            "name": "OH卡梳理",
            "quantity": r.purchase_count,
            "amount": r.amount,
            "effective_date": created,
            "expiry_date": "",
            "closer_name": r.closer_name or "",
            "customer_id": r.customer_id,
        })

    # 其他项目
    for p in other_project_service.list_projects():
        created = p.created_at.strftime("%Y-%m-%d") if hasattr(p.created_at, "strftime") else str(p.created_at)
        records.append({
            "date": p.deal_date or "",
            "nickname": "",
            "type": "其他项目",
            "name": p.project_name,
            "quantity": p.remaining_count if p.remaining_count is not None else "不限",
            "amount": p.fee,
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in p.closers) if p.closers else (p.closer_name or ""),
            "customer_id": p.customer_id,
        })

    # 填充 nickname
    from app.services import customer_service
    customer_map = {}
    for r in records:
        cid = r["customer_id"]
        if cid not in customer_map:
            c = customer_service.get_customer(cid)
            customer_map[cid] = c.nickname if c else ""
        r["nickname"] = customer_map[cid]

    # 日期过滤
    if date_from:
        records = [r for r in records if r["date"] >= date_from]
    if date_to:
        records = [r for r in records if r["date"] <= date_to]

    # 移除辅助字段
    for r in records:
        del r["customer_id"]

    records.sort(key=lambda r: r["date"], reverse=True)
    return paginate(records, page, page_size)


@router.get("/deductions")
def list_deduction_records(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    records = []

    # 项目销卡
    for d in project_deduction_service.list_deductions():
        records.append({
            "date": d.deduction_date,
            "nickname": d.nickname,
            "type": TYPE_LABELS.get(d.project_type, d.project_type),
            "name": d.project_name,
            "count": d.count,
        })

    # 其他项目销卡
    for d in other_project_deduction_service.list_deductions():
        records.append({
            "date": d.deduction_date,
            "nickname": d.nickname,
            "type": "其他项目",
            "name": d.project_name,
            "count": d.count,
        })

    # 日期过滤
    if date_from:
        records = [r for r in records if r["date"] >= date_from]
    if date_to:
        records = [r for r in records if r["date"] <= date_to]

    records.sort(key=lambda r: r["date"], reverse=True)
    return paginate(records, page, page_size)
