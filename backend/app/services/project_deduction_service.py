import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.project_deduction import ProjectDeduction, ProjectDeductionCreate
from app.services import customer_service
from app.services.storage import load_data, save_data, save_item

FILENAME = "project_deductions.json"
COARSE_DOOR_CARD_TYPE = "粗门次卡"
_deductions: Dict[str, ProjectDeduction] = {}
_deduct_lock = threading.RLock()


def _load():
    global _deductions
    data = load_data(FILENAME)
    _deductions = {k: ProjectDeduction(**v) for k, v in data.items()}


def _save(deduction_id: str = ""):
    if deduction_id:
        item = _deductions.get(deduction_id)
        if item:
            save_item(FILENAME, deduction_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _deductions.items()}
        save_data(FILENAME, data)


_load()


def list_deductions(customer_id: Optional[str] = None, nickname: Optional[str] = None, project_type: Optional[str] = None) -> List[ProjectDeduction]:
    results = [d for d in _deductions.values() if not d.is_deleted]
    if customer_id:
        results = [d for d in results if d.customer_id == customer_id]
    if nickname:
        q = nickname.lower()
        results = [d for d in results if q in (d.nickname or "").lower()]
    if project_type:
        results = [d for d in results if d.project_type == project_type]
    results.sort(key=lambda d: d.created_at, reverse=True)

    # 动态计算当前实际剩余次数
    _fill_current_remaining(results)

    return results


def _fill_current_remaining(deductions: List[ProjectDeduction]):
    """仅为没有历史快照的老记录补值，已有快照不随当前余额变化。"""
    from app.services import membership_card_service

    # 按 customer_id + project_type 分组
    groups: dict[str, list[ProjectDeduction]] = {}
    for d in deductions:
        key = f"{d.customer_id}|{d.project_type}"
        groups.setdefault(key, []).append(d)

    for key, items in groups.items():
        customer_id, project_type = key.split("|", 1)

        if project_type == "membership-cards":
            for d in items:
                if d.remaining_after is None:
                    card_remaining = membership_card_service.get_card_effective_remaining(d.project_id)
                    d.remaining_after = card_remaining
            continue
        elif project_type == "other-projects":
            from app.services import other_project_service
            for d in items:
                if d.remaining_after is None:
                    d.remaining_after = other_project_service.get_effective_remaining(d.project_id)
            continue
        else:
            from app.services import (
                emotional_release_session_service,
                energy_knot_session_service,
                group_case_session_service,
                oh_card_reading_session_service,
            )
            svc_map = {
                "group-cases": group_case_session_service,
                "emotional-releases": emotional_release_session_service,
                "oh-card-readings": oh_card_reading_session_service,
                "energy-knots": energy_knot_session_service,
            }
            svc = svc_map.get(project_type)
            if svc:
                for d in items:
                    if d.remaining_after is None:
                        d.remaining_after = svc.get_purchase_remaining(d.project_id)


def get_deduction_total(customer_id: str, project_type: str) -> int:
    return sum(d.count for d in _deductions.values()
               if d.customer_id == customer_id and d.project_type == project_type and not d.is_deleted)


# 注意：project_deduction_service 内部 _deductions 与 membership_card_service._deductions 重名但语义不同：
#       前者是销卡（ProjectDeduction，带 project_id 字段）的字典；后者是会员卡活动扣费追踪的 dict。
def get_deduction_total_for_project(project_id: str) -> int:
    """统计某 project_id（例如某张会员卡 id）的销卡次数总和。"""
    return sum(d.count for d in _deductions.values()
               if d.project_id == project_id and not d.is_deleted and not d.source_activity_id)


def get_available_items(customer_id: str, project_type: str) -> list:
    """返回用户可销卡的项目列表"""
    from app.services import (
        emotional_release_service,
        emotional_release_session_service,
        energy_knot_service,
        energy_knot_session_service,
        group_case_service,
        group_case_session_service,
        membership_card_service,
        oh_card_reading_service,
        oh_card_reading_session_service,
    )

    today = datetime.now().strftime("%Y-%m-%d")

    if project_type == "membership-cards":
        cards = membership_card_service.list_cards()
        available = []
        # 检查是否有不限次卡：有不限次卡时不允许销卡（不限次无需销卡）
        customer_cards = [c for c in cards if c.customer_id == customer_id]
        has_unlimited = any(
            c.remaining_count is None and not c.voided
            and (not c.effective_date or c.effective_date <= today)
            and (not c.expiry_date or c.expiry_date >= today)
            for c in customer_cards
        )
        if has_unlimited:
            return []
        for c in cards:
            if c.customer_id != customer_id:
                continue
            if c.card_type == COARSE_DOOR_CARD_TYPE:
                # 粗门次卡必须绑定具体课程，不能从通用销卡入口直接扣除。
                continue
            if c.remaining_count is None:
                continue
            if c.effective_date and c.effective_date > today:
                continue
            if c.expiry_date and c.expiry_date < today:
                continue
            card_remaining = membership_card_service.get_card_effective_remaining(c.id)
            if card_remaining is not None and card_remaining <= 0:
                continue
            available.append({
                "id": c.id,
                "name": f"{c.card_type}",
                "remaining_count": card_remaining or 0,
                "detail": f"剩余 {card_remaining or 0} 次",
                "card_type": c.card_type,
                "expiry_date": c.expiry_date or "",
            })
        return available

    elif project_type == "group-cases":
        cases = group_case_service.list_cases()
        today = datetime.now().strftime("%Y-%m-%d")
        items = [c for c in cases if c.customer_id == customer_id and not c.is_deleted]
        result = []
        for c in items:
            if c.expiry_date and c.expiry_date < today:
                continue
            if c.effective_date and c.effective_date > today:
                continue
            pr = group_case_session_service.get_purchase_remaining(c.id)
            if pr <= 0:
                continue
            result.append({
                "id": c.id,
                "name": f"觉醒游戏（{c.purchase_count}次）",
                "remaining_count": pr,
                "detail": f"剩余 {pr} 次",
                "purchase_count": c.purchase_count,
            })
        return result

    elif project_type == "emotional-releases":
        releases = emotional_release_service.list_releases()
        today = datetime.now().strftime("%Y-%m-%d")
        items = [r for r in releases if r.customer_id == customer_id and not r.is_deleted]
        result = []
        for r in items:
            if r.expiry_date and r.expiry_date < today:
                continue
            if r.effective_date and r.effective_date > today:
                continue
            pr = emotional_release_session_service.get_purchase_remaining(r.id)
            if pr <= 0:
                continue
            result.append({
                "id": r.id,
                "name": f"情绪释放（{r.purchase_count}次）",
                "remaining_count": pr,
                "detail": f"剩余 {pr} 次",
                "purchase_count": r.purchase_count,
            })
        return result

    elif project_type == "oh-card-readings":
        readings = oh_card_reading_service.list_readings()
        items = [r for r in readings if r.customer_id == customer_id and not r.is_deleted]
        result = []
        for r in items:
            pr = oh_card_reading_session_service.get_purchase_remaining(r.id)
            if pr <= 0:
                continue
            result.append({
                "id": r.id,
                "name": f"OH卡诊断（{r.purchase_count}次）",
                "remaining_count": pr,
                "detail": f"剩余 {pr} 次",
                "purchase_count": r.purchase_count,
            })
        return result

    elif project_type == "energy-knots":
        knots = energy_knot_service.list_knots()
        today = datetime.now().strftime("%Y-%m-%d")
        items = [k for k in knots if k.customer_id == customer_id and not k.is_deleted]
        result = []
        for k in items:
            if k.expiry_date and k.expiry_date < today:
                continue
            if k.effective_date and k.effective_date > today:
                continue
            pr = energy_knot_session_service.get_purchase_remaining(k.id)
            if pr <= 0:
                continue
            result.append({
                "id": k.id,
                "name": f"能量结（{k.purchase_count}个）",
                "remaining_count": pr,
                "detail": f"剩余 {pr} 个",
                "purchase_count": k.purchase_count,
            })
        return result

    elif project_type == "other-projects":
        from app.services import other_project_service
        projects = other_project_service.list_projects()
        available = []
        for p in projects:
            if p.customer_id != customer_id:
                continue
            if p.is_deleted:
                continue
            if p.effective_date and p.effective_date > today:
                continue
            if p.expiry_date and p.expiry_date < today:
                continue
            effective_remaining = other_project_service.get_effective_remaining(p.id)
            if effective_remaining is not None and effective_remaining <= 0:
                continue
            available.append({
                "id": p.id,
                "name": p.project_name,
                "remaining_count": effective_remaining,
                "detail": "不限" if effective_remaining is None else f"剩余 {effective_remaining} 次",
                "category": p.category,
                "expiry_date": p.expiry_date or "",
            })
        return available

    return []


def auto_deduct(
    nickname: str,
    project_type: str,
    count: int = 1,
    created_by: str = "",
    name_filter: str = "",
    reason: str = "Excel批量导入销卡",
) -> ProjectDeduction:
    """按昵称自动销卡：找到最早到期的可用项目并扣减（仅用于 Excel 导入）"""
    customers = customer_service.list_customers()
    matches = [c for c in customers if c.nickname == nickname]
    if not matches:
        raise ValueError(f'用户"{nickname}"不存在')
    if len(matches) > 1:
        raise ValueError(f'存在多个昵称为"{nickname}"的用户，请使用客户ID销卡')
    customer = matches[0]

    items = get_available_items(customer.id, project_type)
    if not items:
        type_labels = {
            "membership-cards": "会员卡",
            "group-cases": "觉醒游戏",
            "emotional-releases": "情绪释放",
            "oh-card-readings": "OH卡诊断",
            "energy-knots": "能量结",
            "other-projects": "其他项目",
        }
        raise ValueError(f'用户"{nickname}"没有可用的{type_labels.get(project_type, project_type)}')

    # 按名称筛选：会员卡按 card_type，其他项目按 name（项目名称）
    if name_filter:
        if project_type == "membership-cards":
            items = [i for i in items if i.get("card_type") == name_filter]
        elif project_type == "other-projects":
            items = [i for i in items if i.get("name") == name_filter]
        if not items:
            raise ValueError(f'用户"{nickname}"没有匹配的"{name_filter}"')

    # 优先选最早到期的（会员卡、其他项目有 expiry_date）
    items_with_expiry = [i for i in items if i.get("expiry_date")]
    if items_with_expiry:
        items_with_expiry.sort(key=lambda i: i["expiry_date"])
        target = items_with_expiry[0]
    else:
        target = items[0]

    data = ProjectDeductionCreate(
        customer_id=customer.id,
        project_type=project_type,
        project_id=target["id"],
        count=count,
        reason=reason,
        created_by=created_by,
    )
    return create_deduction(data)


def create_deduction(data: ProjectDeductionCreate) -> ProjectDeduction:
    with _deduct_lock:
        from app.services.payment_project_validation import require_deductible_project

        require_deductible_project(data.project_type, data.project_id, data.customer_id)
        reason = data.reason.strip()
        if not reason:
            raise ValueError("请填写销卡内容")

        customer = customer_service.get_customer(data.customer_id)
        if not customer:
            raise ValueError("客户不存在")

        from app.services import membership_card_service

        # 计算扣减后的剩余次数
        if data.project_type == "membership-cards":
            # 销卡只写流水，不动 card.remaining_count 字段（其早已是派生缓存）
            card = membership_card_service.get_card(data.project_id)
            if not card:
                raise ValueError("会员卡不存在")
            if card.voided:
                raise ValueError("该卡已退费，无法销卡")
            if card.customer_id != data.customer_id:
                raise ValueError("该会员卡不属于该客户")
            if card.remaining_count is None:
                raise ValueError("该卡为不限次卡，无法销卡")
            if card.card_type == COARSE_DOOR_CARD_TYPE and not data.source_activity_id:
                raise ValueError("粗门次卡必须选择具体课程后扣除")
            card_remaining = membership_card_service.get_card_effective_remaining(data.project_id)
            if card_remaining is None:
                raise ValueError("该卡为不限次卡，无法销卡")
            is_course_assignment = bool(
                data.source_activity_id and card.card_type == COARSE_DOOR_CARD_TYPE
            )
            if not is_course_assignment and card_remaining < data.count:
                raise ValueError(f"剩余次数不足（剩余 {card_remaining} 次）")
            project_name = card.card_type if card else "会员卡"
            card_remaining = membership_card_service.get_card_effective_remaining(data.project_id)
            remaining_after = card_remaining if is_course_assignment else (card_remaining or 0) - data.count

        elif data.project_type == "other-projects":
            from app.services import other_project_service
            project = other_project_service.get_project(data.project_id)
            if not project or project.is_deleted:
                raise ValueError("项目不存在")
            effective_remaining = other_project_service.get_effective_remaining(data.project_id)
            if effective_remaining is None:
                raise ValueError("该项目为不限次，无法销卡")
            if effective_remaining < data.count:
                raise ValueError(f"剩余次数不足（剩余 {effective_remaining} 次）")
            project_name = project.project_name
            remaining_after = effective_remaining - data.count

        else:
            from app.services import (
                emotional_release_service,
                emotional_release_session_service,
                energy_knot_service,
                energy_knot_session_service,
                group_case_service,
                group_case_session_service,
                oh_card_reading_service,
                oh_card_reading_session_service,
            )

            service_map = {
                "group-cases": (group_case_session_service, group_case_service),
                "emotional-releases": (emotional_release_session_service, emotional_release_service),
                "oh-card-readings": (oh_card_reading_session_service, oh_card_reading_service),
                "energy-knots": (energy_knot_session_service, energy_knot_service),
            }

            if data.project_type not in service_map:
                raise ValueError(f"不支持的项目类型: {data.project_type}")

            session_svc, parent_svc = service_map[data.project_type]
            remaining = session_svc.get_purchase_remaining(data.project_id)
            if remaining < data.count:
                raise ValueError(f"剩余次数不足（剩余 {remaining} 次）")

            item = parent_svc.get_case(data.project_id) if hasattr(parent_svc, 'get_case') else None
            if not item:
                item = parent_svc.get_release(data.project_id) if hasattr(parent_svc, 'get_release') else None
            if not item:
                item = parent_svc.get_reading(data.project_id) if hasattr(parent_svc, 'get_reading') else None
            if not item:
                item = parent_svc.get_knot(data.project_id) if hasattr(parent_svc, 'get_knot') else None

            type_labels = {
                "group-cases": "觉醒游戏",
                "emotional-releases": "情绪释放",
                "oh-card-readings": "OH卡诊断",
                "energy-knots": "能量结",
            }
            project_name = type_labels.get(data.project_type, data.project_type)
            remaining_after = remaining - data.count

        now = datetime.now(timezone.utc)
        deduction = ProjectDeduction(
            id=str(uuid.uuid4())[:12],
            customer_id=data.customer_id,
            nickname=customer.nickname,
            project_type=data.project_type,
            project_id=data.project_id,
            project_name=project_name,
            count=data.count,
            deduction_date=data.deduction_date or datetime.now().strftime("%Y-%m-%d"),
            remaining_after=remaining_after,
            reason=reason,
            notes=data.notes,
            created_by=data.created_by,
            updated_by=data.created_by,
            closer_id=data.closer_id,
            closer_name=data.closer_name,
            closers=data.closers,
            organization_id=data.organization_id,
            organization_name=data.organization_name,
            source_activity_type=data.source_activity_type,
            source_activity_id=data.source_activity_id,
            source_activity_key=data.source_activity_key,
            source_activity_name=data.source_activity_name,
            source_activity_date=data.source_activity_date,
            source_organization_id=data.source_organization_id,
            source_organization_name=data.source_organization_name,
            source_space_id=data.source_space_id,
            source_space_name=data.source_space_name,
            created_at=now,
        )
        _deductions[deduction.id] = deduction
        _save(deduction.id)
        return deduction


def _activity_rows(customer_id: str) -> list[dict]:
    """汇总客户仍在参与名单中的课程，供粗门次卡人工选择。"""
    from app.services import (
        class_record_service,
        course_service,
        course_type_service,
        emotional_release_session_service,
        group_case_session_service,
        organization_service,
    )

    rows: list[dict] = []

    organizations = organization_service.list_organizations()
    organization_ids = {organization.id for organization in organizations}
    member_organizations: dict[str, set[str]] = {}
    for organization in organizations:
        for member_id in organization.member_ids:
            member_organizations.setdefault(member_id, set()).add(organization.id)

    courses = course_service.list_courses()
    course_organizations = {
        course.id: course.organization_id
        for course in courses
        if course.organization_id in organization_ids
    }
    course_name_organizations = {
        course.name: course.organization_id
        for course in courses
        if course.name and course.organization_id in organization_ids
    }
    type_organizations = {
        item.get("name", ""): item.get("organization_id", "")
        for item in course_type_service.list_course_types()
        if item.get("name") and item.get("organization_id") in organization_ids
    }

    def resolve_organization_ids(record_type: str, record) -> list[str]:
        """按课程配置识别组织，无法识别时回退到授课老师所属组织。"""
        resolved: set[str] = set()
        if record_type == "class":
            course_id = getattr(record, "course_id", "")
            course_name = getattr(record, "course_name", "")
            course_type = getattr(record, "course_type", "")
            if course_organizations.get(course_id):
                resolved.add(course_organizations[course_id])
            elif course_name_organizations.get(course_name):
                resolved.add(course_name_organizations[course_name])
            elif type_organizations.get(course_type):
                resolved.add(type_organizations[course_type])

        if not resolved:
            teacher_ids = set(getattr(record, "teacher_ids", []) or [])
            achiever_id = getattr(record, "achiever_id", "")
            if achiever_id:
                teacher_ids.add(achiever_id)
            for teacher_id in teacher_ids:
                resolved.update(member_organizations.get(teacher_id, set()))
        return sorted(resolved)

    def append_row(record_type: str, record, participant_ids: set[str], name: str, course_type: str):
        if customer_id not in participant_ids:
            return
        from app.services import membership_card_service

        deduction_count = membership_card_service.get_activity_deduction_count(record)
        if deduction_count <= 0:
            return
        if customer_id not in membership_card_service.filter_arrived_customer_ids(
            record.date,
            {customer_id},
        ):
            return
        rows.append({
            "record_type": record_type,
            "record_id": record.id,
            "name": name or course_type or "未命名课程",
            "course_type": course_type or "",
            "date": record.date,
            "start_time": record.start_time or "",
            "deduction_count": deduction_count,
            "space_id": record.space_id or "",
            "space_name": record.space_name or "",
            "organization_ids": resolve_organization_ids(record_type, record),
        })

    for record in class_record_service.list_records():
        if record.is_public_welfare:
            continue
        participants = class_record_service._get_registered_participant_ids(record)
        participants -= set(record.withdrawn_participant_ids or [])
        append_row(
            "class",
            record,
            participants,
            record.activity_name or record.course_name,
            record.course_type,
        )

    session_groups = (
        ("gcs", group_case_session_service, "觉醒游戏"),
        ("ers", emotional_release_session_service, "情绪释放"),
    )
    for record_type, service, default_type in session_groups:
        for session in service.list_sessions():
            participants = service._get_chargeable_ids(session)
            name = getattr(session, "name", "") or getattr(session, "course_name", "") or default_type
            course_type = getattr(session, "course_type", "") or default_type
            append_row(record_type, session, participants, name, course_type)

    rows.sort(key=lambda item: (item["date"], item["start_time"], item["name"]), reverse=True)
    return rows


def get_coarse_door_options(customer_id: str) -> dict:
    """返回已参与、扣卡次数大于0、且尚未用粗门次卡抵扣的课程。"""
    from app.services import organization_service

    used = {
        (item.source_activity_type, item.source_activity_id)
        for item in _deductions.values()
        if not item.is_deleted
        and item.customer_id == customer_id
        and item.project_type == "membership-cards"
        and item.project_name == COARSE_DOOR_CARD_TYPE
        and item.source_activity_type
        and item.source_activity_id
    }
    courses = []
    for row in _activity_rows(customer_id):
        if (row["record_type"], row["record_id"]) in used:
            continue
        courses.append(row)

    organization_map = {
        organization.id: organization.name
        for organization in organization_service.list_organizations()
    }
    visible_organization_ids = {
        organization_id
        for course in courses
        for organization_id in course["organization_ids"]
        if organization_id in organization_map
    }
    course_organizations = [
        {"id": organization_id, "name": organization_map[organization_id]}
        for organization_id in visible_organization_ids
    ]
    settlement_organizations = [
        {"id": organization.id, "name": organization.name}
        for organization in organization_service.list_organizations()
    ]
    return {
        # organizations 保留给旧版小程序，语义与 course_organizations 相同。
        "organizations": sorted(course_organizations, key=lambda item: item["name"]),
        "course_organizations": sorted(course_organizations, key=lambda item: item["name"]),
        "settlement_organizations": sorted(
            settlement_organizations,
            key=lambda item: item["name"],
        ),
        "courses": [course for course in courses if course["organization_ids"]],
    }


def create_coarse_door_course_deduction(
    customer_id: str,
    record_type: str,
    record_id: str,
    course_organization_id: str,
    settlement_organization_id: str,
    deal_date: str,
    closers: list[dict],
    notes: str,
    created_by: str,
) -> ProjectDeduction:
    with _deduct_lock:
        option = next(
            (
                item for item in get_coarse_door_options(customer_id)["courses"]
                if item["record_type"] == record_type and item["record_id"] == record_id
            ),
            None,
        )
        if not option:
            raise ValueError("该课程不可抵扣，可能未到场、扣卡次数为0、已退课或已经抵扣")
        if course_organization_id not in option["organization_ids"]:
            raise ValueError("所选课程不属于该课程所属，请重新选择")
        from app.services import organization_service

        organizations = organization_service.list_organizations()
        course_organization = next(
            (item for item in organizations if item.id == course_organization_id),
            None,
        )
        if not course_organization:
            raise ValueError("所选课程所属不存在，请重新选择")
        settlement_organization = next(
            (item for item in organizations if item.id == settlement_organization_id),
            None,
        )
        if not settlement_organization:
            raise ValueError("所选所属组织不存在，请重新选择")
        deduction_count = option["deduction_count"]
        from app.services import membership_card_service

        activity_keys = membership_card_service.assign_activity_to_coarse_offset(
            customer_id,
            option["record_type"],
            option["record_id"],
            deduction_count,
        )
        customer = customer_service.get_customer(customer_id)
        if not customer:
            membership_card_service.release_coarse_card_assignment(customer_id, activity_keys)
            raise ValueError("客户不存在")
        now = datetime.now(timezone.utc)
        valid_closers = [
            {
                "id": str(item.get("id") or ""),
                "name": str(item.get("name") or "").strip(),
                "amount": 0,
            }
            for item in closers
            if str(item.get("name") or "").strip()
        ]
        primary_closer = valid_closers[0] if valid_closers else {}
        deduction = ProjectDeduction(
            id=str(uuid.uuid4())[:12],
            customer_id=customer_id,
            nickname=customer.nickname,
            project_type="membership-cards",
            project_id=f'coarse:{option["record_type"]}:{option["record_id"]}',
            project_name=COARSE_DOOR_CARD_TYPE,
            count=deduction_count,
            reason=f'粗门次卡抵扣：{option["date"]} {option["name"]}，返还原会员卡{deduction_count}次',
            notes=notes.strip(),
            created_by=created_by,
            updated_by=created_by,
            closer_id=primary_closer.get("id", ""),
            closer_name=primary_closer.get("name", ""),
            closers=valid_closers,
            organization_id=settlement_organization.id,
            organization_name=settlement_organization.name,
            deduction_date=deal_date or option["date"],
            remaining_after=None,
            source_activity_type=option["record_type"],
            source_activity_id=option["record_id"],
            source_activity_key=",".join(activity_keys),
            source_activity_name=option["name"],
            source_activity_date=option["date"],
            source_organization_id=course_organization.id,
            source_organization_name=course_organization.name,
            source_space_id=option["space_id"],
            source_space_name=option["space_name"],
            created_at=now,
        )
        try:
            _deductions[deduction.id] = deduction
            _save(deduction.id)
            return deduction
        except Exception:
            _deductions.pop(deduction.id, None)
            membership_card_service.release_coarse_card_assignment(customer_id, activity_keys)
            raise



def update_deduction(
    deduction_id: str,
    count: int,
    updated_by: str = "",
    reason: str | None = None,
) -> ProjectDeduction:
    """修改销卡次数（不重新扣费，不覆盖创建人）"""
    with _deduct_lock:
        deduction = _deductions.get(deduction_id)
        if not deduction or deduction.is_deleted:
            raise ValueError("记录不存在")
        if count < 1:
            raise ValueError("次数必须大于 0")
        if reason is not None and not reason.strip():
            raise ValueError("请填写销卡内容")

        if deduction.project_name == COARSE_DOOR_CARD_TYPE and count != deduction.count:
            raise ValueError("粗门抵扣次数由课程决定，请撤销抵扣后重新选择课程，不能直接修改次数")
        if count != deduction.count:
            from app.services.payment_project_validation import available_count, require_deductible_project

            require_deductible_project(deduction.project_type, deduction.project_id, deduction.customer_id)
            remaining = available_count(deduction.project_type, deduction.project_id)
            if remaining is None:
                raise ValueError("不限次项目无法修改销卡次数")
            if count > deduction.count + remaining:
                raise ValueError(f"剩余次数不足（最多可改为 {deduction.count + remaining} 次）")

        deduction.count = count
        deduction.remaining_after = None  # 重算剩余次数
        if reason is not None:
            deduction.reason = reason.strip()
        deduction.updated_by = updated_by
        _deductions[deduction_id] = deduction
        _save(deduction_id)
        return deduction


def delete_deduction(deduction_id: str) -> None:
    """软删除销卡记录"""
    with _deduct_lock:
        deduction = _deductions.get(deduction_id)
        if not deduction or deduction.is_deleted:
            raise ValueError("记录不存在")

        if deduction.source_activity_key and deduction.project_name == COARSE_DOOR_CARD_TYPE:
            from app.services import membership_card_service

            membership_card_service.release_coarse_card_assignment(
                deduction.customer_id,
                [key for key in deduction.source_activity_key.split(",") if key],
            )

        # 剩余次数由 total_count - 销卡流水 动态计算，
        # 软删除后自动排除，无需回写 remaining_count

        deduction.is_deleted = True
        _deductions[deduction_id] = deduction
        _save(deduction_id)
