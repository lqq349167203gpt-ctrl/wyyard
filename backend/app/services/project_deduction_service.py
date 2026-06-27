import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.project_deduction import ProjectDeduction, ProjectDeductionCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "project_deductions.json"
_deductions: Dict[str, ProjectDeduction] = {}


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


def list_deductions(customer_id: Optional[str] = None) -> List[ProjectDeduction]:
    results = [d for d in _deductions.values() if not d.is_deleted]
    if customer_id:
        results = [d for d in results if d.customer_id == customer_id]
    results.sort(key=lambda d: d.created_at, reverse=True)
    return results


def get_deduction_total(customer_id: str, project_type: str) -> int:
    return sum(d.count for d in _deductions.values()
               if d.customer_id == customer_id and d.project_type == project_type and not d.is_deleted)


def get_available_items(customer_id: str, project_type: str) -> list:
    """返回用户可销卡的项目列表"""
    from app.services import (
        membership_card_service, group_case_service, emotional_release_service,
        oh_card_reading_service, energy_knot_service,
        group_case_session_service, emotional_release_session_service,
        oh_card_reading_session_service, energy_knot_session_service,
    )

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if project_type == "membership-cards":
        cards = membership_card_service.list_cards()
        # 该用户的有效剩余天数，完全由流水派生，不再读 card.remaining_count 字段
        effective = membership_card_service.get_effective_remaining(customer_id)
        available = []
        if effective is None:
            return []  # 不限次卡不允许走销卡
        for c in cards:
            if c.customer_id != customer_id:
                continue
            if c.remaining_count is None:
                continue
            if c.effective_date and c.effective_date > today:
                continue
            if c.expiry_date and c.expiry_date < today:
                continue
            available.append({
                "id": c.id,
                "name": f"{c.card_type}",
                "remaining_count": effective,
                "detail": f"剩余 {effective} 次",
                "card_type": c.card_type,
                "expiry_date": c.expiry_date or "",
            })
        return available

    elif project_type == "group-cases":
        cases = group_case_service.list_cases()
        remaining = group_case_session_service.get_remaining_count(customer_id)
        items = [c for c in cases if c.customer_id == customer_id and not c.is_deleted]
        return [{
            "id": c.id,
            "name": f"觉醒游戏（{c.purchase_count}次）",
            "remaining_count": remaining,
            "detail": f"总剩余 {remaining} 次",
            "purchase_count": c.purchase_count,
        } for c in items]

    elif project_type == "emotional-releases":
        releases = emotional_release_service.list_releases()
        remaining = emotional_release_session_service.get_remaining_count(customer_id)
        items = [r for r in releases if r.customer_id == customer_id and not r.is_deleted]
        return [{
            "id": r.id,
            "name": f"情绪释放（{r.purchase_count}次）",
            "remaining_count": remaining,
            "detail": f"总剩余 {remaining} 次",
            "purchase_count": r.purchase_count,
        } for r in items]

    elif project_type == "oh-card-readings":
        readings = oh_card_reading_service.list_readings()
        remaining = oh_card_reading_session_service.get_remaining_count(customer_id)
        items = [r for r in readings if r.customer_id == customer_id and not r.is_deleted]
        return [{
            "id": r.id,
            "name": f"OH卡梳理（{r.purchase_count}次）",
            "remaining_count": remaining,
            "detail": f"总剩余 {remaining} 次",
            "purchase_count": r.purchase_count,
        } for r in items]

    elif project_type == "energy-knots":
        knots = energy_knot_service.list_knots()
        remaining = energy_knot_session_service.get_remaining_count(customer_id)
        items = [k for k in knots if k.customer_id == customer_id and not k.is_deleted]
        return [{
            "id": k.id,
            "name": f"能量结（{k.purchase_count}次）",
            "remaining_count": remaining,
            "detail": f"总剩余 {remaining} 次",
            "purchase_count": k.purchase_count,
        } for k in items]

    elif project_type == "other-projects":
        from app.services import other_project_service
        projects = other_project_service.list_projects()
        items = [p for p in projects if p.customer_id == customer_id and not p.is_deleted and p.remaining_count is not None and p.remaining_count > 0]
        available = []
        for p in items:
            if p.effective_date and p.effective_date > today:
                continue
            if p.expiry_date and p.expiry_date < today:
                continue
            available.append({
                "id": p.id,
                "name": p.project_name,
                "remaining_count": p.remaining_count,
                "detail": f"剩余 {p.remaining_count} 次",
                "category": p.category,
                "expiry_date": p.expiry_date or "",
            })
        return available

    return []


def auto_deduct(nickname: str, project_type: str, count: int = 1, operator_name: str = "", name_filter: str = "") -> ProjectDeduction:
    """按昵称自动销卡：找到最早到期的可用项目并扣减（仅用于 Excel 导入）"""
    customers = customer_service.list_customers()
    customer = next((c for c in customers if c.nickname == nickname), None)
    if not customer:
        raise ValueError(f'用户"{nickname}"不存在')

    items = get_available_items(customer.id, project_type)
    if not items:
        type_labels = {
            "membership-cards": "会员卡",
            "group-cases": "觉醒游戏",
            "emotional-releases": "情绪释放",
            "oh-card-readings": "OH卡梳理",
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
        operator_name=operator_name,
    )
    return create_deduction(data)


def create_deduction(data: ProjectDeductionCreate) -> ProjectDeduction:
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
        if card.remaining_count is None:
            raise ValueError("该卡为不限次卡，无法销卡")
        effective = membership_card_service.get_effective_remaining(data.customer_id)
        if effective is None:
            raise ValueError("该卡为不限次卡，无法销卡")
        if effective < data.count:
            raise ValueError(f"剩余次数不足（剩余 {effective} 次）")
        project_name = card.card_type if card else "会员活动"
        remaining_after = effective - data.count

    elif data.project_type == "other-projects":
        from app.services import other_project_service
        project = other_project_service.get_project(data.project_id)
        if not project or project.is_deleted:
            raise ValueError("项目不存在")
        if project.remaining_count is None:
            raise ValueError("该项目为不限次，无法销卡")
        if project.remaining_count < data.count:
            raise ValueError(f"剩余次数不足（剩余 {project.remaining_count} 次）")
        project.remaining_count -= data.count
        project.updated_at = datetime.now(timezone.utc)
        other_project_service._projects[project.id] = project
        save_item(other_project_service.FILENAME, project.id, project.model_dump(mode="json"))
        project_name = project.project_name
        remaining_after = project.remaining_count

    else:
        from app.services import (
            group_case_session_service, emotional_release_session_service,
            oh_card_reading_session_service, energy_knot_session_service,
            group_case_service, emotional_release_service,
            oh_card_reading_service, energy_knot_service,
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
        remaining = session_svc.get_remaining_count(data.customer_id)
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
            "oh-card-readings": "OH卡梳理",
            "energy-knots": "能量结",
        }
        project_name = type_labels.get(data.project_type, data.project_type)
        remaining_after = remaining - data.count

    now = datetime.now(timezone.utc)
    deduction = ProjectDeduction(
        id=str(uuid.uuid4())[:8],
        customer_id=data.customer_id,
        nickname=customer.nickname,
        project_type=data.project_type,
        project_id=data.project_id,
        project_name=project_name,
        count=data.count,
        deduction_date=now.strftime("%Y-%m-%d"),
        remaining_after=remaining_after,
        operator_name=data.operator_name,
        created_at=now,
    )
    _deductions[deduction.id] = deduction
    _save(deduction.id)
    return deduction


def update_deduction(deduction_id: str, count: int, operator_name: str = "") -> ProjectDeduction:
    """修改销卡次数（仅修改次数和操作人，不重新扣费）"""
    deduction = _deductions.get(deduction_id)
    if not deduction or deduction.is_deleted:
        raise ValueError("记录不存在")
    if count < 1:
        raise ValueError("次数必须大于 0")
    deduction.count = count
    deduction.operator_name = operator_name
    _deductions[deduction_id] = deduction
    _save(deduction_id)
    return deduction


def delete_deduction(deduction_id: str) -> None:
    """软删除销卡记录，并恢复对应项目的剩余次数"""
    deduction = _deductions.get(deduction_id)
    if not deduction or deduction.is_deleted:
        raise ValueError("记录不存在")

    # 会员卡销卡基于流水，软删除即自动从 get_deduction_total 中排除，无需回写 card.remaining_count
    if deduction.project_type == "membership-cards":
        pass

    elif deduction.project_type == "other-projects":
        from app.services import other_project_service
        project = other_project_service.get_project(deduction.project_id)
        if project and project.remaining_count is not None:
            project.remaining_count += deduction.count
            project.updated_at = datetime.now(timezone.utc)
            other_project_service._projects[project.id] = project
            save_item(other_project_service.FILENAME, project.id, project.model_dump(mode="json"))

    # 觉醒/情绪释放/OH卡/能量结：剩余次数由 get_deduction_total 计算，
    # 软删除后自动排除，无需额外处理

    deduction.is_deleted = True
    _deductions[deduction_id] = deduction
    _save(deduction_id)
