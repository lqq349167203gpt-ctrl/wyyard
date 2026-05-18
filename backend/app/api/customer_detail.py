"""
客户详情聚合 API - 疗愈记录详情视图专用
汇总单个客户的所有业务数据
"""
import json
from fastapi import APIRouter, HTTPException
from app.services import (
    customer_service,
    visit_service,
    membership_card_service,
    group_case_service,
    emotional_release_service,
    energy_knot_service,
    internal_course_service,
    class_record_service,
    group_case_session_service,
    emotional_release_session_service,
    energy_knot_session_service,
    internal_course_session_service,
    healing_record_service,
)

router = APIRouter(prefix="/api/customer-detail", tags=["customer-detail"])


@router.get("/{customer_id}")
def get_customer_detail(customer_id: str):
    """获取单个客户的完整聚合详情"""
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")

    basic = customer.model_dump(mode="json")
    basic["visit_count"] = visit_service.count_customer_visits(customer_id)

    purchase_summary = _build_purchase_summary(customer_id)
    activities = _build_activities(customer_id)
    healing_records = [
        r.model_dump(mode="json")
        for r in healing_record_service.list_records(customer_id)
    ]
    payment_records = _build_payment_records(customer_id)

    return {
        "customer": basic,
        "purchase_summary": purchase_summary,
        "activities": activities,
        "healing_records": healing_records,
        "payment_records": payment_records,
    }


def _parse_ek_names(desc) -> str:
    """解析能量结 description JSON，提取案主名，用丨连接"""
    if not desc:
        return ""
    try:
        items = json.loads(desc)
        if isinstance(items, list):
            names = [item.get("name", "") for item in items if item.get("name")]
            return "丨".join(names)
    except (json.JSONDecodeError, TypeError):
        pass
    return ""


def _build_purchase_summary(customer_id: str) -> list:
    """构建购买汇总: 每个服务类型的总购买次数/金额和剩余次数"""
    summary = []

    # 到店日期集合（仅已到店的日期才算已用）
    arrived_dates = {v.visit_date for v in visit_service.list_visits(customer_id=customer_id) if v.arrived}

    # 会员活动
    cards = [c for c in membership_card_service.list_cards() if c.customer_id == customer_id]
    for c in cards:
        summary.append({
            "type": "会员活动",
            "name": c.card_type,
            "total_purchased": c.remaining_count if c.remaining_count is not None else "不限",
            "total_amount": c.price,
            "used": "-",
            "remaining": c.remaining_count if c.remaining_count is not None else "不限",
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
        })

    # 觉醒游戏（仅统计已到店日期的 session）
    gc_cases = [c for c in group_case_service.list_cases() if c.customer_id == customer_id]
    gc_purchased = sum(c.purchase_count for c in gc_cases)
    gc_used = sum(1 for s in group_case_session_service.list_sessions() if s.owner_id == customer_id and s.date in arrived_dates)
    if gc_purchased > 0:
        summary.append({
            "type": "觉醒游戏",
            "name": "",
            "total_purchased": gc_purchased,
            "total_amount": sum(c.amount for c in gc_cases),
            "used": gc_used,
            "remaining": gc_purchased - gc_used,
            "effective_date": "",
            "expiry_date": "",
        })

    # 情绪释放（仅统计已到店日期的 session）
    er_releases = [r for r in emotional_release_service.list_releases() if r.customer_id == customer_id]
    er_purchased = sum(r.purchase_count for r in er_releases)
    er_used = sum(1 for s in emotional_release_session_service.list_sessions() if s.owner_id == customer_id and s.date in arrived_dates)
    if er_purchased > 0:
        summary.append({
            "type": "情绪释放",
            "name": "",
            "total_purchased": er_purchased,
            "total_amount": sum(r.amount for r in er_releases),
            "used": er_used,
            "remaining": er_purchased - er_used,
            "effective_date": "",
            "expiry_date": "",
        })

    # 能量结（仅统计已到店日期的 session）
    ek_knots = [k for k in energy_knot_service.list_knots() if k.customer_id == customer_id]
    ek_purchased = sum(k.purchase_count for k in ek_knots)
    ek_used = sum(1 for s in energy_knot_session_service.list_sessions() if s.owner_id == customer_id and s.date in arrived_dates)
    if ek_purchased > 0:
        summary.append({
            "type": "能量结",
            "name": "",
            "total_purchased": ek_purchased,
            "total_amount": sum(k.amount for k in ek_knots),
            "used": ek_used,
            "remaining": ek_purchased - ek_used,
            "effective_date": "",
            "expiry_date": "",
        })

    # 内部课程
    ic_courses = [c for c in internal_course_service.list_courses() if c.customer_id == customer_id]
    for c in ic_courses:
        summary.append({
            "type": "内部课程",
            "name": c.course_type,
            "total_purchased": 1,
            "total_amount": c.price,
            "used": "-",
            "remaining": "-",
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
        })

    return summary


def _build_activities(customer_id: str) -> list:
    """合并所有活动记录，按日期倒序"""
    activities = []

    # 课程记录 - 作为参与者
    for r in class_record_service.list_records():
        if customer_id in r.participant_ids:
            teacher_names = []
            for tid in r.teacher_ids:
                t = customer_service.get_customer(tid)
                teacher_names.append(t.nickname or t.name if t else tid)
            activities.append({
                "type": "沙龙类型",
                "date": r.date,
                "name": r.course_name,
                "role": "参与者",
                "host": ", ".join(teacher_names),
                "session_id": r.id,
                "is_public_welfare": r.is_public_welfare,
            })

    # 觉醒游戏
    for s in group_case_session_service.list_sessions():
        gc_name = f"觉醒游戏【{s.owner_name}】" if s.owner_name else "觉醒游戏"
        if s.owner_id == customer_id:
            activities.append({
                "type": "觉醒游戏",
                "date": s.date,
                "name": gc_name,
                "role": "案主",
                "host": s.host_name or s.achiever_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in s.participant_ids:
            activities.append({
                "type": "觉醒游戏",
                "date": s.date,
                "name": gc_name,
                "role": "参与者",
                "host": s.host_name or s.achiever_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })

    # 情绪释放
    for s in emotional_release_session_service.list_sessions():
        er_name = f"情绪释放【{s.owner_name}】" if s.owner_name else "情绪释放"
        if s.owner_id == customer_id:
            activities.append({
                "type": "情绪释放",
                "date": s.date,
                "name": er_name,
                "role": "案主",
                "host": s.host_name or s.achiever_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in s.participant_ids:
            activities.append({
                "type": "情绪释放",
                "date": s.date,
                "name": er_name,
                "role": "参与者",
                "host": s.host_name or s.achiever_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })

    # 能量结
    for s in energy_knot_session_service.list_sessions():
        ek_names = _parse_ek_names(s.description)
        ek_name = f"能量结【{ek_names}】" if ek_names else "能量结"
        if s.owner_id == customer_id:
            activities.append({
                "type": "能量结",
                "date": s.date,
                "name": ek_name,
                "role": "案主",
                "host": ", ".join(s.host_names) if s.host_names else "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in s.participant_ids:
            activities.append({
                "type": "能量结",
                "date": s.date,
                "name": ek_name,
                "role": "参与者",
                "host": ", ".join(s.host_names) if s.host_names else "",
                "session_id": s.id,
                "is_public_welfare": False,
            })

    # 内部课程
    for s in internal_course_session_service.list_sessions():
        if customer_id in s.participant_ids:
            activities.append({
                "type": "内部课程",
                "date": s.date,
                "name": s.course_name,
                "role": "参与者",
                "host": ", ".join(s.host_names) if s.host_names else "",
                "session_id": s.id,
                "is_public_welfare": False,
            })

    activities.sort(key=lambda a: a["date"], reverse=True)
    return activities


def _build_payment_records(customer_id: str) -> list:
    """构建收费记录: 返回扁平列表，每条记录包含类型、数量、价格、生效日期、到期日期、成交人"""
    records = []

    # 会员活动
    cards = [c for c in membership_card_service.list_cards() if c.customer_id == customer_id]
    for c in cards:
        records.append({
            "type": "会员活动",
            "name": c.card_type,
            "quantity": 1,
            "amount": c.price,
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
            "closer_name": c.closer_name or "",
            "created_at": c.effective_date,
        })

    # 觉醒游戏
    gc = [c for c in group_case_service.list_cases() if c.customer_id == customer_id]
    for c in gc:
        records.append({
            "type": "觉醒游戏",
            "name": "觉醒游戏",
            "quantity": c.purchase_count,
            "amount": c.amount,
            "effective_date": c.created_at.strftime("%Y-%m-%d"),
            "expiry_date": "",
            "closer_name": c.closer_name or "",
            "created_at": c.created_at.strftime("%Y-%m-%d"),
        })

    # 情绪释放
    er = [r for r in emotional_release_service.list_releases() if r.customer_id == customer_id]
    for r in er:
        records.append({
            "type": "情绪释放",
            "name": "情绪释放",
            "quantity": r.purchase_count,
            "amount": r.amount,
            "effective_date": r.created_at.strftime("%Y-%m-%d"),
            "expiry_date": "",
            "closer_name": r.closer_name or "",
            "created_at": r.created_at.strftime("%Y-%m-%d"),
        })

    # 能量结
    ek = [k for k in energy_knot_service.list_knots() if k.customer_id == customer_id]
    for k in ek:
        records.append({
            "type": "能量结",
            "name": "能量结",
            "quantity": k.purchase_count,
            "amount": k.amount,
            "effective_date": k.created_at.strftime("%Y-%m-%d"),
            "expiry_date": "",
            "closer_name": k.closer_name or "",
            "created_at": k.created_at.strftime("%Y-%m-%d"),
        })

    # 内部课程
    ic = [c for c in internal_course_service.list_courses() if c.customer_id == customer_id]
    for c in ic:
        records.append({
            "type": "内部课程",
            "name": c.course_type,
            "quantity": 1,
            "amount": c.price,
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
            "closer_name": "",
            "created_at": c.effective_date,
        })

    # 按创建日期倒序
    records.sort(key=lambda r: r["created_at"] or "", reverse=True)
    return records
