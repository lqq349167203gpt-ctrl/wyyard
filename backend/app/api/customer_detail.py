"""
客户详情聚合 API - 疗愈记录详情视图专用
汇总单个客户的所有业务数据
"""
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request
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
    other_project_service,
    oh_card_reading_service,
    oh_card_reading_session_service,
)

router = APIRouter(prefix="/api/customer-detail", tags=["customer-detail"])


@router.get("/{customer_id}")
def get_customer_detail(customer_id: str, request: Request = None):
    """获取单个客户的完整聚合详情"""
    # 客户角色只能查看自己的数据
    if request:
        user_role = getattr(request.state, "user_role", "")
        if user_role == "customer":
            state_customer_id = getattr(request.state, "customer_id", "")
            if state_customer_id != customer_id:
                raise HTTPException(status_code=403, detail="权限不足")
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")

    basic = customer.model_dump(mode="json")
    basic["visit_count"] = visit_service.count_customer_visits(customer_id)

    purchase_summary = _build_purchase_summary(customer_id)
    # 获取已到店日期集合
    arrived_dates = {v.visit_date for v in visit_service.list_visits(customer_id=customer_id) if v.arrived}
    activities = _build_activities(customer_id, arrived_dates)
    healing_records = [
        r.model_dump(mode="json")
        for r in healing_record_service.list_records(customer_id)
    ]
    payment_records = _build_payment_records(customer_id)
    visit_records = [
        r.model_dump(mode="json")
        for r in visit_service.list_visits(customer_id=customer_id)
    ]

    return {
        "customer": basic,
        "purchase_summary": purchase_summary,
        "activities": activities,
        "healing_records": healing_records,
        "payment_records": payment_records,
        "visit_records": visit_records,
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


def _count_internal_course_covered(customer_id: str) -> int:
    """统计内部课程覆盖的活动场次（次数卡+不限次卡都扣完后多出来的部分）

    逻辑：先扣次数卡 → 次数卡扣完走不限次卡 → 都没有才走内部课程。
    """
    if not internal_course_service.has_active_course(customer_id):
        return 0
    raw_activities = membership_card_service._count_raw_activities(customer_id)
    if raw_activities <= 0:
        return 0
    # 有不限次卡时，次数卡扣完后走不限次卡，不会走到内部课程
    from app.services import membership_card_service as mcs
    today = __import__('datetime').datetime.now().strftime("%Y-%m-%d")
    active = mcs._active_cards(customer_id, today)
    if any(c.remaining_count is None for c in active):
        return 0
    grand_total = membership_card_service.get_grand_total(customer_id)
    manual = membership_card_service.get_manual_deductions(customer_id)
    card_available = max(0, grand_total - manual)
    return max(0, raw_activities - card_available)


def _build_purchase_summary(customer_id: str) -> list:
    """构建购买汇总: 每个服务类型的总购买次数/金额和剩余次数"""
    summary = []

    # 会员活动 — 唯一真理：剩余 = 总 - 销卡 - 活动扣卡
    cards = [c for c in membership_card_service.list_cards() if c.customer_id == customer_id]
    grand_total = membership_card_service.get_grand_total(customer_id)
    manual_deductions = membership_card_service.get_manual_deductions(customer_id)
    # 活动扣卡 = 已扣卡流水 + 欠费登记流水
    activity_deductions = membership_card_service.get_activity_deductions(customer_id)
    # 内部课程抵扣：活动日期落在内部课程期间内的场次
    internal_course_deductions = _count_internal_course_covered(customer_id)
    # 不限次扣卡：通过不限次卡扣除的活动次数（无不限次卡时为0）
    raw_activities = membership_card_service._count_raw_activities(customer_id)
    today = __import__('datetime').datetime.now().strftime("%Y-%m-%d")
    active = membership_card_service._active_cards(customer_id, today)
    has_unlimited = any(c.remaining_count is None for c in active)
    unlimited_deductions = max(0, raw_activities - activity_deductions - internal_course_deductions) if has_unlimited else 0
    # 有效剩余次数（None=不限次）；无卡则 0
    effective_remaining = membership_card_service.get_effective_remaining(customer_id)
    # 是否存在未分卡的老扣费记录（card_id=None），决定是否需要聚合分摊
    has_untracked_deductions = membership_card_service.has_untracked_deductions(customer_id)
    # 仅保留次数卡参与分摊（不限次卡不参与分摊）
    countable_cards = [c for c in cards if c.remaining_count is not None]
    sum_total = sum((c.total_count or 0) for c in countable_cards)
    # 先计算每张卡的 remaining，再汇总为 effective_remaining
    card_info_list = []
    voided_cards_info = []
    if cards:
        for c in cards:
            if c.voided:
                # 已作废（退费）卡：不参与有效剩余计算，剩余次数归零
                total = c.total_count if c.total_count is not None else "不限"
                used = total if isinstance(total, int) else "-"
                card_remaining = "已退费"
                card_manual = membership_card_service.get_card_manual_deductions(c.id) if c.id else 0
                card_activity = membership_card_service.get_card_activity_deductions(c.id) if c.id else 0
                voided_cards_info.append((c, total, used, card_remaining, card_manual, card_activity))
                continue
            card_manual = membership_card_service.get_card_manual_deductions(c.id) if c.id else 0
            card_activity = membership_card_service.get_card_activity_deductions(c.id) if c.id else 0
            if c.remaining_count is None:
                total = "不限"
                used = "-"
                card_remaining = "不限"
            elif c.total_count is None:
                total = "不限"
                used = "-"
                card_remaining = "不限"
            else:
                total = c.total_count
                if card_activity > 0 or card_manual > 0:
                    card_remaining = max(0, total - card_manual - card_activity)
                    used = max(0, total - card_remaining)
                elif has_untracked_deductions and sum_total > 0 and effective_remaining is not None:
                    share = round(effective_remaining * (total / sum_total))
                    card_remaining = share
                    used = max(0, total - share)
                else:
                    card_remaining = max(0, total - card_manual)
                    used = max(0, total - card_remaining)
            card_info_list.append((c, total, used, card_remaining, card_manual, card_activity))
        # 用各卡 remaining 之和覆盖 effective_remaining，保证全局与单卡一致
        # 但如果存在欠费未分卡的扣费记录（_debt_activities），各卡统计不完整，保留全局值
        has_debt = bool(membership_card_service._debt_activities.get(customer_id))
        numeric_remaining = [info[3] for info in card_info_list if isinstance(info[3], (int, float))]
        if numeric_remaining and not has_debt:
            effective_remaining = sum(numeric_remaining)
        for c, total, used, card_remaining, card_manual, card_activity in card_info_list:
            summary.append({
                "type": "会员卡",
                "name": c.card_type,
                "total_purchased": total,
                "grand_total": grand_total,
                "total_amount": c.price,
                "used": used,
                "remaining": card_remaining,
                "effective_remaining": effective_remaining,
                "manual_deductions": card_manual,
                "activity_deductions": card_activity,
                "internal_course_deductions": internal_course_deductions,
                "unlimited_deductions": unlimited_deductions,
                "effective_date": c.effective_date,
                "expiry_date": c.expiry_date or "",
                "voided": False,
            })
        # 追加已作废（退费）卡，放在可用卡之后，不参与有效剩余汇总
        for c, total, used, card_remaining, card_manual, card_activity in voided_cards_info:
            summary.append({
                "type": "会员卡",
                "name": c.card_type,
                "total_purchased": total,
                "grand_total": grand_total,
                "total_amount": c.price,
                "used": used,
                "remaining": card_remaining,
                "effective_remaining": effective_remaining,
                "manual_deductions": card_manual,
                "activity_deductions": card_activity,
                "internal_course_deductions": internal_course_deductions,
                "unlimited_deductions": unlimited_deductions,
                "effective_date": c.effective_date,
                "expiry_date": c.expiry_date or "",
                "voided": True,
                "voided_at": c.voided_at.strftime("%Y-%m-%d") if c.voided_at else "",
            })
    else:
        summary.append({
            "type": "会员卡",
            "name": "",
            "total_purchased": 0,
            "grand_total": 0,
            "total_amount": 0,
            "used": "-",
            "remaining": 0,
            "effective_remaining": effective_remaining,
            "manual_deductions": manual_deductions,
            "activity_deductions": activity_deductions,
            "internal_course_deductions": internal_course_deductions,
                "unlimited_deductions": unlimited_deductions,
            "effective_date": "",
            "expiry_date": "",
            "voided": False,
        })

    # 觉醒游戏
    gc_cases = [c for c in group_case_service.list_cases() if c.customer_id == customer_id]
    gc_purchased = sum(c.purchase_count for c in gc_cases)
    if gc_purchased > 0:
        gc_remaining = group_case_session_service.get_remaining_count(customer_id)
        summary.append({
            "type": "觉醒游戏",
            "name": "",
            "total_purchased": gc_purchased,
            "total_amount": sum(c.amount for c in gc_cases),
            "used": gc_purchased - gc_remaining,
            "remaining": gc_remaining,
            "effective_date": "",
            "expiry_date": "",
        })

    # 情绪释放
    er_releases = [r for r in emotional_release_service.list_releases() if r.customer_id == customer_id]
    er_purchased = sum(r.purchase_count for r in er_releases)
    if er_purchased > 0:
        er_remaining = emotional_release_session_service.get_remaining_count(customer_id)
        summary.append({
            "type": "情绪释放",
            "name": "",
            "total_purchased": er_purchased,
            "total_amount": sum(r.amount for r in er_releases),
            "used": er_purchased - er_remaining,
            "remaining": er_remaining,
            "effective_date": "",
            "expiry_date": "",
        })

    # 能量结
    ek_knots = [k for k in energy_knot_service.list_knots() if k.customer_id == customer_id]
    ek_purchased = sum(k.purchase_count for k in ek_knots)
    if ek_purchased > 0:
        ek_remaining = energy_knot_session_service.get_remaining_count(customer_id)
        summary.append({
            "type": "能量结",
            "name": "",
            "total_purchased": ek_purchased,
            "total_amount": sum(k.amount for k in ek_knots),
            "used": ek_purchased - ek_remaining,
            "remaining": ek_remaining,
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

    # OH卡梳理
    ocr_readings = [r for r in oh_card_reading_service.list_readings() if r.customer_id == customer_id]
    ocr_purchased = sum(r.purchase_count for r in ocr_readings)
    if ocr_purchased > 0:
        ocr_remaining = oh_card_reading_session_service.get_remaining_count(customer_id)
        summary.append({
            "type": "OH卡梳理",
            "name": "",
            "total_purchased": ocr_purchased,
            "total_amount": sum(r.amount for r in ocr_readings),
            "used": ocr_purchased - ocr_remaining,
            "remaining": ocr_remaining,
            "effective_date": "",
            "expiry_date": "",
        })

    # 其他项目
    op_projects = [p for p in other_project_service.list_projects() if p.customer_id == customer_id]
    for p in op_projects:
        summary.append({
            "type": "其他项目",
            "name": p.project_name,
            "total_purchased": p.remaining_count if p.remaining_count is not None else "不限",
            "total_amount": p.fee,
            "used": "-",
            "remaining": p.remaining_count if p.remaining_count is not None else "不限",
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date or "",
            "activity_mode": p.activity_mode or "线下",
        })

    return summary


def _build_activities(customer_id: str, arrived_dates: set = None) -> list:
    """合并所有活动记录，按日期倒序（必须实际到店）"""
    activities = []

    # 课程记录 - 作为参与者或老师（必须实际到店）
    for r in class_record_service.list_records():
        if arrived_dates is not None and r.date not in arrived_dates:
            continue
        teacher_names = []
        for tid in r.teacher_ids:
            t = customer_service.get_customer(tid)
            teacher_names.append(t.nickname or t.name if t else tid)
        host = ", ".join(teacher_names)
        chargeable = class_record_service._get_group_member_ids(r)
        if customer_id in chargeable:
            activities.append({
                "type": "沙龙类型",
                "date": r.date,
                "name": r.course_name,
                "course_type": r.course_type or "",
                "role": "参与者",
                "host": host,
                "session_id": r.id,
                "is_public_welfare": r.is_public_welfare,
            })
        elif customer_id in (r.teacher_ids or []):
            activities.append({
                "type": "沙龙类型",
                "date": r.date,
                "name": r.course_name,
                "course_type": r.course_type or "",
                "role": "老师",
                "host": host,
                "session_id": r.id,
                "is_public_welfare": r.is_public_welfare,
            })

    # 觉醒游戏（必须实际到店）
    for s in group_case_session_service.list_sessions():
        if arrived_dates is not None and s.date not in arrived_dates:
            continue
        gc_name = f"觉醒游戏【{s.owner_name}】" if s.owner_name else "觉醒游戏"
        if s.owner_id == customer_id:
            activities.append({
                "type": "觉醒游戏",
                "date": s.date,
                "name": gc_name,
                "role": "案主",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in s.participant_ids:
            activities.append({
                "type": "觉醒游戏",
                "date": s.date,
                "name": gc_name,
                "role": "参与者",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in (s.teacher_ids or []):
            activities.append({
                "type": "觉醒游戏",
                "date": s.date,
                "name": gc_name,
                "role": "老师",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })

    # 情绪释放（必须实际到店）
    for s in emotional_release_session_service.list_sessions():
        if arrived_dates is not None and s.date not in arrived_dates:
            continue
        er_name = f"情绪释放【{s.owner_name}】" if s.owner_name else "情绪释放"
        if s.owner_id == customer_id:
            activities.append({
                "type": "情绪释放",
                "date": s.date,
                "name": er_name,
                "role": "案主",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in s.participant_ids:
            activities.append({
                "type": "情绪释放",
                "date": s.date,
                "name": er_name,
                "role": "参与者",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in (s.teacher_ids or []):
            activities.append({
                "type": "情绪释放",
                "date": s.date,
                "name": er_name,
                "role": "老师",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })

    # 能量结（必须实际到店）
    for s in energy_knot_session_service.list_sessions():
        if arrived_dates is not None and s.date not in arrived_dates:
            continue
        ek_names = _parse_ek_names(s.description)
        ek_name = f"能量结【{ek_names}】" if ek_names else "能量结"
        host = ", ".join([customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids])
        if s.owner_id == customer_id:
            activities.append({
                "type": "能量结",
                "date": s.date,
                "name": ek_name,
                "role": "案主",
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in s.participant_ids:
            activities.append({
                "type": "能量结",
                "date": s.date,
                "name": ek_name,
                "role": "参与者",
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in (s.teacher_ids or []):
            activities.append({
                "type": "能量结",
                "date": s.date,
                "name": ek_name,
                "role": "老师",
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
            })

    # 内部课程（必须实际到店）
    for s in internal_course_session_service.list_sessions():
        if arrived_dates is not None and s.date not in arrived_dates:
            continue
        host = ", ".join([customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids])
        if customer_id in s.participant_ids:
            activities.append({
                "type": "内部课程",
                "date": s.date,
                "name": s.course_name,
                "course_type": s.course_type or "",
                "role": "参与者",
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in (s.teacher_ids or []):
            activities.append({
                "type": "内部课程",
                "date": s.date,
                "name": s.course_name,
                "course_type": s.course_type or "",
                "role": "老师",
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
            })

    # OH卡梳理
    for s in oh_card_reading_session_service.list_sessions():
        ocr_name = f"OH卡梳理【{s.owner_name}】" if s.owner_name else "OH卡梳理"
        if s.owner_id == customer_id:
            activities.append({
                "type": "OH卡梳理",
                "date": s.date,
                "name": ocr_name,
                "role": "案主",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in s.participant_ids:
            activities.append({
                "type": "OH卡梳理",
                "date": s.date,
                "name": ocr_name,
                "role": "参与者",
                "host": s.host_name or "",
                "session_id": s.id,
                "is_public_welfare": False,
            })
        elif customer_id in (s.teacher_ids or []):
            activities.append({
                "type": "OH卡梳理",
                "date": s.date,
                "name": ocr_name,
                "role": "老师",
                "host": s.host_name or "",
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
            "type": "会员卡",
            "name": c.card_type,
            "quantity": 1,
            "amount": c.price,
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "created_at": c.effective_date,
            "voided": c.voided,
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
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
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
            "closer_name": ", ".join(cl["name"] for cl in r.closers) if r.closers else (r.closer_name or ""),
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
            "closer_name": ", ".join(cl["name"] for cl in k.closers) if k.closers else (k.closer_name or ""),
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
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "created_at": c.effective_date,
        })

    # OH卡梳理
    ocr = [r for r in oh_card_reading_service.list_readings() if r.customer_id == customer_id]
    for r in ocr:
        records.append({
            "type": "OH卡梳理",
            "name": "OH卡梳理",
            "quantity": r.purchase_count,
            "amount": r.amount,
            "effective_date": r.created_at.strftime("%Y-%m-%d"),
            "expiry_date": "",
            "closer_name": r.closer_name or "",
            "created_at": r.created_at.strftime("%Y-%m-%d"),
        })

    # 其他项目
    op = [p for p in other_project_service.list_projects() if p.customer_id == customer_id]
    for p in op:
        created = p.created_at.strftime("%Y-%m-%d") if hasattr(p.created_at, "strftime") else str(p.created_at or "")
        records.append({
            "type": "其他项目",
            "name": p.project_name,
            "quantity": p.remaining_count if p.remaining_count is not None else "不限",
            "amount": p.fee,
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in p.closers) if p.closers else (p.closer_name or ""),
            "created_at": created,
        })

    # 按创建日期倒序
    records.sort(key=lambda r: r["created_at"] or "", reverse=True)
    return records
