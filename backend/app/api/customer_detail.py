"""
客户详情聚合 API - 疗愈记录详情视图专用
汇总单个客户的所有业务数据
"""
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from app.services import (
    activity_followup_service,
    class_record_service,
    customer_access_service,
    customer_contact_service,
    customer_service,
    emotional_release_service,
    emotional_release_session_service,
    energy_knot_service,
    energy_knot_session_service,
    group_case_service,
    group_case_session_service,
    healing_record_service,
    internal_course_service,
    internal_course_session_service,
    membership_card_service,
    offline_course_record_service,
    offline_course_service,
    oh_card_reading_service,
    other_project_service,
    tea_seat_fee_service,
    visit_note_service,
    visit_service,
)

router = APIRouter(prefix="/api/customer-detail", tags=["customer-detail"])

ACTIVITY_SUMMARY_TYPES = (
    ("class", "沙龙活动"),
    ("gcs", "觉醒游戏"),
    ("ers", "情绪释放"),
    ("eks", "能量结"),
    ("ics", "内部课程"),
)


def _build_activity_summary(activities: list[dict]) -> list[dict]:
    """按统一口径统计实际参与场次，并把当前退课记录单独列出。"""
    summary = [
        {
            "key": key,
            "label": label,
            "count": sum(
                1
                for activity in activities
                if activity.get("activity_type") == key
                and activity.get("participated") is True
                and not activity.get("withdrawn")
            ),
        }
        for key, label in ACTIVITY_SUMMARY_TYPES
    ]
    summary.append({
        "key": "withdrawn",
        "label": "退课",
        "count": sum(1 for activity in activities if activity.get("withdrawn")),
    })
    return summary


@router.get("/{customer_id}")
def get_customer_detail(customer_id: str, request: Request, date: str | None = None):
    """获取单个客户的完整聚合详情"""
    # 客户角色只能查看自己的数据
    user_role = getattr(request.state, "user_role", "")
    if user_role == "customer":
        state_customer_id = getattr(request.state, "customer_id", "")
        if state_customer_id != customer_id:
            raise HTTPException(status_code=403, detail="权限不足")
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    is_customer_self = user_role == "customer"
    if not is_customer_self and not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail="没有查看该客户的权限")

    permissions = None if is_customer_self else customer_access_service.get_customer_permissions(user_role)
    can_follow_up = is_customer_self or bool(permissions["detail_tabs"]["follow_up"])
    can_view_activities = is_customer_self or bool(permissions["detail_tabs"]["activities"])
    can_view_followups = is_customer_self or bool(permissions["detail_tabs"]["customer_followups"])
    can_view_cards = is_customer_self or bool(permissions["detail_tabs"]["card_statistics"])
    can_view_offline = is_customer_self or bool(permissions["detail_tabs"]["offline_courses"])
    transaction_level = "detail" if is_customer_self else permissions["transaction_access"]

    basic = customer.model_dump(mode="json")
    if not is_customer_self:
        basic = customer_access_service.protect_sensitive_data(basic, user_role)
        basic = customer_contact_service.protect_customer_data(
            basic,
            user_role,
            include_permissions=True,
        )
        basic["customer_access_permissions"] = permissions
    basic["visit_count"] = visit_service.count_customer_visits(customer_id)

    purchase_summary = _build_purchase_summary(customer_id) if can_view_cards else []
    # date 参数：只返回该日期的活动
    if not can_view_activities:
        activities = []
    elif date:
        activities = _build_activities(customer_id, date_filter={date})
    else:
        activities = _build_activities(customer_id)
    healing_records = [
        r.model_dump(mode="json")
        for r in healing_record_service.list_records(customer_id)
    ] if can_follow_up else []
    all_payment_records = _build_payment_records(customer_id, date) if transaction_level != "none" else []
    basic["total_payment"] = (
        sum(float(record.get("amount") or 0) for record in all_payment_records if not record.get("voided"))
        if transaction_level != "none"
        else None
    )
    payment_records = all_payment_records if transaction_level == "detail" else []
    offline_course_records = _build_offline_course_records(customer_id) if can_view_offline else []
    visits = visit_service.list_visits(customer_id=customer_id)
    notes_by_visit: dict[str, list[dict]] = {visit.id: [] for visit in visits}
    actor_id = getattr(request.state, "user_id", "") or ""
    actor_owner = getattr(request.state, "user_owner", "") or ""
    actor_username = getattr(request.state, "user_name", "") or ""
    visible_visit_notes = (
        visit_note_service.list_visible_notes(
            notes_by_visit,
            actor_id,
            actor_owner,
            actor_username,
        )
        if can_follow_up
        else []
    )
    for note in visible_visit_notes:
        notes_by_visit.setdefault(note.visit_id, []).append(
            {
                "id": note.id,
                "category": note.category,
                "content": note.content,
                "created_by_id": note.created_by_id,
                "created_by": note.created_by,
                "created_at": note.created_at,
                "updated_at": note.updated_at,
            }
        )
    visit_records = []
    for visit in (visits if can_follow_up else []):
        record = visit.model_dump(mode="json")
        record["visit_notes"] = notes_by_visit.get(visit.id, [])
        record["needs"] = next(
            (
                note["content"]
                for note in record["visit_notes"]
                if note["category"] == "visit_need"
            ),
            "",
        )
        visit_records.append(record)

    return {
        "customer": basic,
        "purchase_summary": purchase_summary,
        "activities": activities,
        "activity_summary": _build_activity_summary(activities),
        "activity_followups": [
            record.model_dump(mode="json")
            for record in activity_followup_service.list_followups(customer_id)
        ] if can_view_followups else [],
        "healing_records": healing_records,
        "payment_records": payment_records,
        "offline_course_records": offline_course_records,
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
    """统计会员卡不可用后，实际由内部课程权益覆盖的活动场次。"""
    return sum(
        1
        for record in membership_card_service.list_activity_usage_records(customer_id)
        if record.get("benefit_type") == "internal_course"
    )


def _match_offline_course_attendance(customer_id: str, courses: list) -> dict[str, int]:
    """按有效期将线下落地课程的上课记录唯一匹配到对应购买记录。"""
    attendance_counts = {course.id: 0 for course in courses}
    if not courses:
        return attendance_counts

    for record in offline_course_record_service.list_records(customer_id):
        record_date = (record.record_date or "")[:10]
        if not record_date:
            continue

        matching_courses = []
        for course in courses:
            effective_date = (course.effective_date or "")[:10]
            expiry_date = _calc_offline_expiry(course.effective_date, course.validity_value)
            if effective_date and record_date < effective_date:
                continue
            if expiry_date and record_date > expiry_date:
                continue
            matching_courses.append(course)

        if not matching_courses:
            continue

        # 有效期重叠时归入最近生效的一笔，确保一条上课记录只统计一次。
        matched_course = max(
            matching_courses,
            key=lambda course: (
                course.effective_date or "",
                course.created_at.isoformat() if hasattr(course.created_at, "isoformat") else str(course.created_at),
                course.id,
            ),
        )
        attendance_counts[matched_course.id] += 1

    return attendance_counts


def _build_purchase_summary(customer_id: str) -> list:
    """构建购买汇总: 每个服务类型的总购买次数/金额和剩余次数"""
    summary = []

    # 会员活动 — 唯一真理：剩余 = 总 - 销卡 - 活动扣卡
    cards = [c for c in membership_card_service.list_cards() if c.customer_id == customer_id]
    grand_total = membership_card_service.get_grand_total(customer_id)
    manual_deductions = membership_card_service.get_manual_deductions(customer_id)
    # 已实际扣到次数卡上的活动扣卡
    activity_deductions = membership_card_service.get_activity_deductions(customer_id)
    # 无可用会员卡时登记的欠卡次数
    advance_deductions = membership_card_service.get_debt(customer_id)
    # 内部课程抵扣：活动日期落在内部课程期间内的场次
    internal_course_deductions = _count_internal_course_covered(customer_id)
    # 不限次扣卡：通过不限次卡扣除的活动次数（无不限次卡时为0）
    raw_activities = membership_card_service._count_raw_activities(customer_id)
    today = __import__('datetime').datetime.now().strftime("%Y-%m-%d")
    active = membership_card_service._active_cards(customer_id, today)
    has_unlimited = any(c.remaining_count is None for c in active)
    current_total = "不限" if has_unlimited else sum((c.total_count or 0) for c in active)
    unlimited_deductions = max(0, raw_activities - activity_deductions - internal_course_deductions) if has_unlimited else 0
    # 净权益值用于保留历史欠卡语义；不能直接作为“当前剩余”，否则会把历史欠卡再次从当前有效卡扣除。
    effective_remaining = membership_card_service.get_effective_remaining(customer_id)
    current_card_remaining = membership_card_service.get_current_card_remaining(customer_id, today)
    # 是否存在未分卡的老扣费记录（card_id=None），决定是否需要聚合分摊
    has_untracked_deductions = membership_card_service.has_untracked_deductions(customer_id)
    # 仅保留次数卡参与分摊（不限次卡不参与分摊）
    countable_cards = [c for c in cards if c.remaining_count is not None]
    sum_total = sum((c.total_count or 0) for c in countable_cards)
    # 先计算每张卡的 remaining，再汇总为 effective_remaining
    card_info_list = []
    voided_cards_info = []
    debt_record = membership_card_service.get_debt_record(customer_id)
    # 当前剩余只统计今天有效的各张会员卡单卡余量；历史欠卡在 debt_count 中独立展示。
    current_remaining: int | str = "不限" if current_card_remaining is None else current_card_remaining
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
                "current_remaining": current_remaining,
                "current_total": current_total,
                "debt_count": debt_record["debt_count"],
                "debt_activities": debt_record["debt_activities"],
                "manual_deductions": card_manual,
                "activity_deductions": card_activity,
                "advance_deductions": advance_deductions,
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
                "current_remaining": current_remaining,
                "current_total": current_total,
                "debt_count": debt_record["debt_count"],
                "debt_activities": debt_record["debt_activities"],
                "manual_deductions": card_manual,
                "activity_deductions": card_activity,
                "advance_deductions": advance_deductions,
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
            "current_remaining": current_remaining,
            "current_total": current_total,
            "debt_count": debt_record["debt_count"],
            "debt_activities": debt_record["debt_activities"],
            "manual_deductions": manual_deductions,
            "activity_deductions": activity_deductions,
            "advance_deductions": advance_deductions,
            "internal_course_deductions": internal_course_deductions,
                "unlimited_deductions": unlimited_deductions,
            "effective_date": "",
            "expiry_date": "",
            "voided": False,
        })

    def _earliest_expiry(purchases):
        """返回最早到期日期和该日期对应的次数，仅统计有效且有到期日的购买。"""
        today = datetime.now().strftime("%Y-%m-%d")
        valid = [p for p in purchases if p.expiry_date and p.expiry_date >= today
                 and (not p.effective_date or p.effective_date <= today)]
        if not valid:
            return "", 0
        earliest = min(p.expiry_date for p in valid)
        cnt = sum(p.purchase_count for p in valid if p.expiry_date == earliest)
        return earliest, cnt

    def _current_purchase_total(purchases):
        """仅汇总当前已生效且未过期的购买次数。"""
        return sum(
            purchase.purchase_count
            for purchase in purchases
            if (not purchase.effective_date or purchase.effective_date <= today)
            and (not purchase.expiry_date or purchase.expiry_date >= today)
        )

    # 觉醒游戏
    gc_cases = [c for c in group_case_service.list_cases() if c.customer_id == customer_id]
    gc_purchased = sum(c.purchase_count for c in gc_cases)
    gc_session_deds = group_case_session_service._get_session_deductions_for_customer(customer_id)
    gc_session_used = sum(d["count"] for d in gc_session_deds)
    gc_remaining = group_case_session_service.get_remaining_count(customer_id)
    gc_effective = group_case_session_service.get_usable_remaining_count(customer_id)
    gc_debt = group_case_session_service.get_debt_record(customer_id)
    gc_used = gc_session_used if gc_purchased == 0 else gc_purchased - gc_effective
    gc_earliest, gc_earliest_cnt = _earliest_expiry(gc_cases)
    if gc_purchased > 0 or gc_session_used > 0:
        summary.append({
            "type": "觉醒游戏",
            "name": "",
            "total_purchased": gc_purchased,
            "total_amount": sum(c.amount for c in gc_cases),
            "used": gc_used,
            "remaining": gc_remaining,
            "effective_remaining": gc_effective,
            "current_remaining": gc_effective,
            "current_total": _current_purchase_total(gc_cases),
            "debt_count": gc_debt["debt_count"],
            "debt_activities": gc_debt["debt_activities"],
            "effective_date": gc_cases[0].effective_date if gc_cases else "",
            "expiry_date": gc_cases[0].expiry_date if gc_cases else "",
            "earliest_expiry": gc_earliest,
            "earliest_expiry_count": gc_earliest_cnt,
            "purchases": [
                {
                    "purchase_count": c.purchase_count,
                    "amount": c.amount,
                    "deal_date": c.deal_date or "",
                    "effective_date": c.effective_date or c.deal_date or "",
                    "expiry_date": c.expiry_date or "",
                    "remaining": group_case_session_service.get_purchase_remaining(c.id),
                }
                for c in gc_cases
            ],
        })

    # 情绪释放
    er_releases = [r for r in emotional_release_service.list_releases() if r.customer_id == customer_id]
    er_purchased = sum(r.purchase_count for r in er_releases)
    er_session_deds = emotional_release_session_service._get_session_deductions_for_customer(customer_id)
    er_session_used = sum(d["count"] for d in er_session_deds)
    er_remaining = emotional_release_session_service.get_remaining_count(customer_id)
    er_effective = emotional_release_session_service.get_usable_remaining_count(customer_id)
    er_debt = emotional_release_session_service.get_debt_record(customer_id)
    er_used = er_session_used if er_purchased == 0 else er_purchased - er_effective
    er_earliest, er_earliest_cnt = _earliest_expiry(er_releases)
    if er_purchased > 0 or er_session_used > 0:
        summary.append({
            "type": "情绪释放",
            "name": "",
            "total_purchased": er_purchased,
            "total_amount": sum(r.amount for r in er_releases),
            "used": er_used,
            "remaining": er_remaining,
            "effective_remaining": er_effective,
            "current_remaining": er_effective,
            "current_total": _current_purchase_total(er_releases),
            "debt_count": er_debt["debt_count"],
            "debt_activities": er_debt["debt_activities"],
            "effective_date": er_releases[0].effective_date if er_releases else "",
            "expiry_date": er_releases[0].expiry_date if er_releases else "",
            "earliest_expiry": er_earliest,
            "earliest_expiry_count": er_earliest_cnt,
            "purchases": [
                {
                    "purchase_count": r.purchase_count,
                    "amount": r.amount,
                    "deal_date": r.deal_date or "",
                    "effective_date": r.effective_date or r.deal_date or "",
                    "expiry_date": r.expiry_date or "",
                    "remaining": emotional_release_session_service.get_purchase_remaining(r.id),
                }
                for r in er_releases
            ],
        })

    # 能量结
    ek_knots = [k for k in energy_knot_service.list_knots() if k.customer_id == customer_id]
    ek_purchased = sum(k.purchase_count for k in ek_knots)
    ek_session_deds = energy_knot_session_service._get_session_deductions_for_customer(customer_id)
    ek_session_used = sum(d["count"] for d in ek_session_deds)
    ek_remaining = energy_knot_session_service.get_remaining_count(customer_id)
    ek_effective = energy_knot_session_service.get_usable_remaining_count(customer_id)
    ek_debt = energy_knot_session_service.get_debt_record(customer_id)
    ek_used = ek_session_used if ek_purchased == 0 else ek_purchased - ek_effective
    ek_earliest, ek_earliest_cnt = _earliest_expiry(ek_knots)
    if ek_purchased > 0 or ek_session_used > 0:
        summary.append({
            "type": "能量结",
            "name": "",
            "total_purchased": ek_purchased,
            "total_amount": sum(k.amount for k in ek_knots),
            "used": ek_used,
            "remaining": ek_remaining,
            "effective_remaining": ek_effective,
            "current_remaining": ek_effective,
            "current_total": _current_purchase_total(ek_knots),
            "debt_count": ek_debt["debt_count"],
            "debt_activities": ek_debt["debt_activities"],
            "effective_date": ek_knots[0].effective_date if ek_knots else "",
            "expiry_date": ek_knots[0].expiry_date if ek_knots else "",
            "earliest_expiry": ek_earliest,
            "earliest_expiry_count": ek_earliest_cnt,
            "purchases": [
                {
                    "purchase_count": k.purchase_count,
                    "amount": k.amount,
                    "deal_date": k.deal_date or "",
                    "effective_date": k.effective_date or k.deal_date or "",
                    "expiry_date": k.expiry_date or "",
                    "remaining": energy_knot_session_service.get_purchase_remaining(k.id),
                }
                for k in ek_knots
            ],
        })

    # 内部课程
    ic_courses = [c for c in internal_course_service.list_courses() if c.customer_id == customer_id]
    for c in ic_courses:
        is_current = (
            (not c.effective_date or c.effective_date <= today)
            and (not c.expiry_date or c.expiry_date >= today)
        )
        summary.append({
            "type": "内部课程",
            "name": c.course_type,
            "total_purchased": 1,
            "total_amount": c.price,
            "used": "-",
            "remaining": "-",
            "current_remaining": "不限" if is_current else 0,
            "current_total": "不限" if is_current else 0,
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
        })

    # 其他项目
    op_projects = [p for p in other_project_service.list_projects() if p.customer_id == customer_id]
    for p in op_projects:
        project_remaining = other_project_service.get_effective_remaining(p.id)
        is_current = (
            (not p.effective_date or p.effective_date <= today)
            and (not p.expiry_date or p.expiry_date >= today)
        )
        project_total = p.total_count if p.total_count is not None else "不限"
        summary.append({
            "type": "其他项目",
            "name": p.project_name,
            "total_purchased": project_total,
            "total_amount": p.fee,
            "used": "-",
            "remaining": project_remaining if project_remaining is not None else "不限",
            "current_remaining": (project_remaining if project_remaining is not None else "不限") if is_current else 0,
            "current_total": project_total if is_current else 0,
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date or "",
            "activity_mode": p.activity_mode or "线下",
        })

    # 线下落地课程
    oc_courses = [r for r in offline_course_service.list_courses() if r.customer_id == customer_id]
    oc_attendance_counts = _match_offline_course_attendance(customer_id, oc_courses)
    for r in oc_courses:
        expiry_date = _calc_offline_expiry(r.effective_date, r.validity_value)
        is_current = (
            (not r.effective_date or r.effective_date <= today)
            and (not expiry_date or expiry_date >= today)
        )
        summary.append({
            "type": "线下落地课程",
            "name": "线下落地课程",
            "total_purchased": 1,
            "total_amount": r.amount,
            "used": "-",
            "remaining": "-",
            "effective_remaining": "-",
            "current_remaining": 1 if is_current else 0,
            "current_total": 1 if is_current else 0,
            "attended_count": oc_attendance_counts.get(r.id, 0),
            "effective_date": r.effective_date or "",
            "expiry_date": expiry_date,
            "validity_value": r.validity_value,
        })

    return summary


def _resolve_activity_role(
    customer_id: str,
    *,
    owner_id: str = "",
    achiever_id: str = "",
    host_id: str = "",
    host_role: str = "",
    teacher_ids: list[str] | None = None,
    participant_ids: list[str] | set[str] | None = None,
) -> str:
    """按固定优先级返回客户在单场活动中的身份。"""
    if owner_id and customer_id == owner_id:
        return "案主"
    if achiever_id and customer_id == achiever_id:
        return "成就君"
    if host_role and host_id and customer_id == host_id:
        return host_role
    if customer_id in (teacher_ids or []):
        return "老师"
    if customer_id in (participant_ids or []):
        return "参与者"
    return ""


def _build_activities(
    customer_id: str,
    arrived_dates: set | None = None,
    date_filter: set[str] | None = None,
) -> list:
    """合并客户参与的活动，可按活动日期过滤；不按客户端发布状态过滤。"""
    # 未指定到达日期时，从到访记录自动计算
    if arrived_dates is None:
        arrived_dates = {
            v.visit_date for v in visit_service.list_visits(customer_id=customer_id)
            if v.arrived
        }
    activities = []

    def deduction_summary(
        *,
        attended: bool,
        membership_count: int = 0,
        project_label: str = "",
        withdrawn: bool = False,
    ) -> str:
        if withdrawn:
            return "已退课"
        if not attended:
            return "未参与"
        if project_label:
            return project_label
        if membership_count > 0:
            return f"会员卡扣卡{membership_count}次"
        return "已参与"

    # 课程记录 - 作为参与者或老师（必须实际到店）
    for r in class_record_service.list_records():
        teacher_names = []
        for tid in r.teacher_ids:
            t = customer_service.get_customer(tid)
            teacher_names.append(t.nickname or t.name if t else tid)
        host = ", ".join(teacher_names)
        registered_participants = class_record_service._get_registered_participant_ids(r)
        chargeable = class_record_service._get_group_member_ids(r)
        withdrawn = customer_id in set(r.withdrawn_participant_ids or [])
        role = _resolve_activity_role(
            customer_id,
            teacher_ids=r.teacher_ids,
            participant_ids=registered_participants,
        )
        if role:
            attended = r.date in arrived_dates and not withdrawn
            membership_count = r.membership_deduction_count if attended and customer_id in chargeable else 0
            activities.append({
                "type": "沙龙类型",
                "date": r.date,
                "name": r.course_name,
                "course_type": r.course_type or "",
                "role": role,
                "host": host,
                "session_id": r.id,
                "is_public_welfare": r.is_public_welfare,
                "participated": attended,
                "withdrawn": withdrawn,
                "membership_deduction_count": membership_count,
                "deduction_summary": deduction_summary(
                    attended=attended,
                    membership_count=membership_count,
                    withdrawn=withdrawn,
                ),
            })

    # 觉醒游戏（必须实际到店）
    for s in group_case_session_service.list_sessions():
        gc_name = f"觉醒游戏【{s.owner_name}】" if s.owner_name else "觉醒游戏"
        teacher_names = [customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids]
        host = ", ".join(teacher_names) if teacher_names else (s.host_name or "")
        role = _resolve_activity_role(
            customer_id,
            owner_id=s.owner_id,
            achiever_id=s.achiever_id,
            host_id=s.host_id,
            host_role="成就君",
            teacher_ids=s.teacher_ids,
            participant_ids=s.participant_ids,
        )
        if role:
            withdrawn = customer_id in set(s.withdrawn_participant_ids or [])
            attended = s.date in arrived_dates and not withdrawn
            chargeable = group_case_session_service._get_chargeable_ids(s)
            membership_count = s.membership_deduction_count if attended and customer_id in chargeable else 0
            activities.append({
                "type": "觉醒游戏",
                "date": s.date,
                "name": gc_name,
                "role": role,
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
                "participated": attended,
                "withdrawn": withdrawn,
                "membership_deduction_count": membership_count,
                "deduction_summary": deduction_summary(
                    attended=attended,
                    membership_count=membership_count,
                    project_label="觉醒游戏扣卡1次" if role == "案主" else "",
                    withdrawn=withdrawn,
                ),
            })

    # 情绪释放（必须实际到店）
    for s in emotional_release_session_service.list_sessions():
        er_name = f"情绪释放【{s.owner_name}】" if s.owner_name else "情绪释放"
        teacher_names = [customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids]
        host = ", ".join(teacher_names) if teacher_names else (s.host_name or "")
        role = _resolve_activity_role(
            customer_id,
            owner_id=s.owner_id,
            achiever_id=s.achiever_id,
            host_id=s.host_id,
            host_role="成就君",
            teacher_ids=s.teacher_ids,
            participant_ids=s.participant_ids,
        )
        if role:
            withdrawn = customer_id in set(s.withdrawn_participant_ids or [])
            attended = s.date in arrived_dates and not withdrawn
            chargeable = emotional_release_session_service._get_chargeable_ids(s)
            membership_count = s.membership_deduction_count if attended and customer_id in chargeable else 0
            activities.append({
                "type": "情绪释放",
                "date": s.date,
                "name": er_name,
                "role": role,
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
                "participated": attended,
                "withdrawn": withdrawn,
                "membership_deduction_count": membership_count,
                "deduction_summary": deduction_summary(
                    attended=attended,
                    membership_count=membership_count,
                    project_label="情绪释放扣卡1次" if role == "案主" else "",
                    withdrawn=withdrawn,
                ),
            })

    # 能量结（必须实际到店）
    for s in energy_knot_session_service.list_sessions():
        ek_names = _parse_ek_names(s.description)
        ek_name = f"能量结【{ek_names}】" if ek_names else "能量结"
        host = ", ".join([customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids])
        role = _resolve_activity_role(
            customer_id,
            owner_id=s.owner_id,
            host_id=s.host_id,
            host_role="老师",
            teacher_ids=s.teacher_ids,
            participant_ids=s.participant_ids,
        )
        if role:
            withdrawn = customer_id in set(s.withdrawn_participant_ids or [])
            attended = s.date in arrived_dates and not withdrawn
            project_count = energy_knot_session_service.get_session_deduction_count(s, customer_id) if role == "案主" else 0
            activities.append({
                "type": "能量结",
                "date": s.date,
                "name": ek_name,
                "role": role,
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
                "participated": attended,
                "withdrawn": withdrawn,
                "membership_deduction_count": 0,
                "deduction_summary": deduction_summary(
                    attended=attended,
                    project_label=f"能量结部位{project_count}个" if role == "案主" else "",
                    withdrawn=withdrawn,
                ),
            })

    # 内部课程（必须实际到店）
    for s in internal_course_session_service.list_sessions():
        host = ", ".join([customer_service.get_customer(tid).nickname if customer_service.get_customer(tid) else tid for tid in s.teacher_ids])
        role = _resolve_activity_role(
            customer_id,
            host_id=s.host_id,
            host_role="老师",
            teacher_ids=s.teacher_ids,
            participant_ids=s.participant_ids,
        )
        if role:
            withdrawn = customer_id in set(s.withdrawn_participant_ids or [])
            attended = s.date in arrived_dates and not withdrawn
            activities.append({
                "type": "内部课程",
                "date": s.date,
                "name": s.course_name,
                "course_type": s.course_type or "",
                "role": role,
                "host": host,
                "session_id": s.id,
                "is_public_welfare": False,
                "participated": attended,
                "withdrawn": withdrawn,
                "membership_deduction_count": 0,
                "deduction_summary": deduction_summary(attended=attended, withdrawn=withdrawn),
            })

    activity_type_codes = {
        "沙龙类型": "class",
        "觉醒游戏": "gcs",
        "情绪释放": "ers",
        "能量结": "eks",
        "内部课程": "ics",
    }
    for activity in activities:
        activity["activity_type"] = activity_type_codes[activity["type"]]
        activity["activity_key"] = (
            f"{activity['activity_type']}:{activity['session_id']}"
        )

    if date_filter is not None:
        activities = [
            activity
            for activity in activities
            if activity.get("date") in date_filter
        ]
    activities.sort(key=lambda a: a["date"], reverse=True)
    return activities


def _build_payment_records(customer_id: str, date: str | None = None) -> list:
    """构建收费记录: 返回扁平列表，每条记录包含类型、数量、价格、生效日期、到期日期、成交人"""
    records = []

    # 会员活动
    cards = [c for c in membership_card_service.list_cards() if c.customer_id == customer_id]
    for c in cards:
        if date and c.deal_date != date:
            continue
        records.append({
            "source_id": c.id,
            "source_created_at": c.created_at.isoformat(),
            "type": "会员卡",
            "name": c.card_type,
            "quantity": 1,
            "amount": c.price,
            "deal_date": c.deal_date or "",
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "created_at": c.effective_date,
            "voided": c.voided,
            "notes": c.notes or "",
        })

    # 觉醒游戏
    gc = [c for c in group_case_service.list_cases() if c.customer_id == customer_id]
    for c in gc:
        if date and c.deal_date != date:
            continue
        records.append({
            "source_id": c.id,
            "source_created_at": c.created_at.isoformat(),
            "type": "觉醒游戏",
            "name": "觉醒游戏",
            "quantity": c.purchase_count,
            "amount": c.amount,
            "deal_date": c.deal_date or "",
            "effective_date": c.effective_date or c.created_at.strftime("%Y-%m-%d"),
            "expiry_date": c.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "created_at": c.created_at.strftime("%Y-%m-%d"),
            "notes": c.notes or "",
        })

    # 情绪释放
    er = [r for r in emotional_release_service.list_releases() if r.customer_id == customer_id]
    for r in er:
        if date and r.deal_date != date:
            continue
        records.append({
            "source_id": r.id,
            "source_created_at": r.created_at.isoformat(),
            "type": "情绪释放",
            "name": "情绪释放",
            "quantity": r.purchase_count,
            "amount": r.amount,
            "deal_date": r.deal_date or "",
            "effective_date": r.effective_date or r.created_at.strftime("%Y-%m-%d"),
            "expiry_date": r.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in r.closers) if r.closers else (r.closer_name or ""),
            "created_at": r.created_at.strftime("%Y-%m-%d"),
            "notes": r.notes or "",
        })

    # 能量结
    ek = [k for k in energy_knot_service.list_knots() if k.customer_id == customer_id]
    for k in ek:
        if date and k.deal_date != date:
            continue
        records.append({
            "source_id": k.id,
            "source_created_at": k.created_at.isoformat(),
            "type": "能量结",
            "name": "能量结",
            "quantity": k.purchase_count,
            "amount": k.amount,
            "deal_date": k.deal_date or "",
            "effective_date": k.effective_date or k.created_at.strftime("%Y-%m-%d"),
            "expiry_date": k.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in k.closers) if k.closers else (k.closer_name or ""),
            "created_at": k.created_at.strftime("%Y-%m-%d"),
            "notes": k.notes or "",
        })

    # 内部课程
    ic = [c for c in internal_course_service.list_courses() if c.customer_id == customer_id]
    for c in ic:
        if date and c.deal_date != date:
            continue
        records.append({
            "source_id": c.id,
            "source_created_at": c.created_at.isoformat(),
            "type": "内部课程",
            "name": c.course_type,
            "quantity": 1,
            "amount": c.price,
            "deal_date": c.deal_date or "",
            "effective_date": c.effective_date,
            "expiry_date": c.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in c.closers) if c.closers else (c.closer_name or ""),
            "created_at": c.effective_date,
            "notes": c.notes or "",
        })

    # OH卡诊断
    ocr = [r for r in oh_card_reading_service.list_readings() if r.customer_id == customer_id]
    for r in ocr:
        if date and r.deal_date != date:
            continue
        dd = r.diagnosis_duration or 1
        records.append({
            "source_id": r.id,
            "source_created_at": r.created_at.isoformat(),
            "type": "OH卡诊断",
            "name": "OH卡诊断",
            "quantity": f"{dd * 0.5}小时",
            "amount": r.amount,
            "deal_date": r.deal_date or "",
            "effective_date": getattr(r, "effective_date", None) or "",
            "expiry_date": getattr(r, "expiry_date", None) or "",
            "closer_name": r.closer_name or "",
            "created_at": r.created_at.strftime("%Y-%m-%d"),
            "notes": r.notes or "",
            "diagnosis_teacher": getattr(r, "diagnosis_teacher", None) or "",
        })

    # 线下落地课程
    oc = [r for r in offline_course_service.list_courses() if r.customer_id == customer_id]
    for r in oc:
        if date and r.deal_date != date:
            continue
        expiry_date = _calc_offline_expiry(r.effective_date, r.validity_value)
        records.append({
            "source_id": r.id,
            "source_created_at": r.created_at.isoformat(),
            "type": "线下落地课程",
            "name": "线下落地课程",
            "quantity": f"{r.validity_value} 个月",
            "amount": r.amount,
            "deal_date": r.deal_date or "",
            "effective_date": r.effective_date or "",
            "expiry_date": expiry_date,
            "closer_name": r.closer_name or "",
            "created_at": r.created_at.strftime("%Y-%m-%d"),
            "notes": r.notes or "",
        })

    # 茶位费
    tsf = [r for r in tea_seat_fee_service.list_fees() if r.customer_id == customer_id]
    for r in tsf:
        if date and r.deal_date != date:
            continue
        records.append({
            "source_id": r.id,
            "source_created_at": r.created_at.isoformat(),
            "type": "茶位费",
            "name": "茶位费",
            "quantity": f"{r.quantity} 位",
            "amount": r.amount,
            "deal_date": r.deal_date or "",
            "effective_date": "",
            "expiry_date": "",
            "closer_name": r.closer_name or "",
            "created_at": r.created_at.strftime("%Y-%m-%d"),
            "notes": r.notes or "",
        })

    # 其他项目
    op = [p for p in other_project_service.list_projects() if p.customer_id == customer_id]
    for p in op:
        if date and p.deal_date != date:
            continue
        created = p.created_at.strftime("%Y-%m-%d") if hasattr(p.created_at, "strftime") else str(p.created_at or "")
        records.append({
            "source_id": p.id,
            "source_created_at": p.created_at.isoformat(),
            "type": "其他项目",
            "name": p.project_name,
            "quantity": p.remaining_count if p.remaining_count is not None else "不限",
            "amount": p.fee,
            "deal_date": p.deal_date or "",
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date or "",
            "closer_name": ", ".join(cl["name"] for cl in p.closers) if p.closers else (p.closer_name or ""),
            "created_at": created,
            "notes": p.notes or "",
        })

    # 按创建日期倒序
    records.sort(key=lambda r: r["created_at"] or "", reverse=True)
    return records


def _calc_offline_expiry(effective_date: str, validity_value: int) -> str:
    """计算线下落地课程的到期日期"""
    if not effective_date or not validity_value:
        return ""
    parts = effective_date.split("-")
    if len(parts) != 3:
        return ""
    eff_year, eff_month, eff_day = int(parts[0]), int(parts[1]), int(parts[2])
    em = eff_month + validity_value
    ey = eff_year + (em - 1) // 12
    em = (em - 1) % 12 + 1
    ed = min(eff_day, 28) if em == 2 else eff_day
    return f"{ey:04d}-{em:02d}-{ed:02d}"


def _build_offline_course_records(customer_id: str) -> list:
    """构建线下落地课程记录列表（上课记录）"""
    records = []
    for r in offline_course_record_service.list_records(customer_id):
        records.append({
            "id": r.id,
            "record_date": r.record_date,
            "teacher": r.teacher,
            "content": r.content,
            "result": r.result,
            "creator": r.creator,
            "created_at": r.created_at.strftime("%Y-%m-%d") if hasattr(r.created_at, "strftime") else str(r.created_at),
        })
    return records
