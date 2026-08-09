import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.project_deduction import ProjectDeduction, ProjectDeductionCreate
from app.services import customer_service
from app.services.storage import load_data, save_data, save_item

FILENAME = "project_deductions.json"
_deductions: Dict[str, ProjectDeduction] = {}
_deduct_lock = threading.Lock()


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
               if d.project_id == project_id and not d.is_deleted)


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
            card_remaining = membership_card_service.get_card_effective_remaining(data.project_id)
            if card_remaining is None:
                raise ValueError("该卡为不限次卡，无法销卡")
            if card_remaining < data.count:
                raise ValueError(f"剩余次数不足（剩余 {card_remaining} 次）")
            project_name = card.card_type if card else "会员卡"
            card_remaining = membership_card_service.get_card_effective_remaining(data.project_id)
            remaining_after = (card_remaining or 0) - data.count

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
            deduction_date=datetime.now().strftime("%Y-%m-%d"),
            remaining_after=remaining_after,
            reason=reason,
            created_by=data.created_by,
            updated_by=data.created_by,
            created_at=now,
        )
        _deductions[deduction.id] = deduction
        _save(deduction.id)
        return deduction



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

        # 剩余次数由 total_count - 销卡流水 动态计算，
        # 软删除后自动排除，无需回写 remaining_count

        deduction.is_deleted = True
        _deductions[deduction_id] = deduction
        _save(deduction_id)
