import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.project_refund import ProjectRefund, ProjectRefundCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "project_refunds.json"
_refunds: Dict[str, ProjectRefund] = {}


def _load():
    global _refunds
    data = load_data(FILENAME)
    _refunds = {k: ProjectRefund(**v) for k, v in data.items()}


def _save(refund_id: str = ""):
    if refund_id:
        item = _refunds.get(refund_id)
        if item:
            save_item(FILENAME, refund_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _refunds.items()}
        save_data(FILENAME, data)


_load()


def list_refunds(customer_id: Optional[str] = None, nickname: Optional[str] = None, project_type: Optional[str] = None) -> List[ProjectRefund]:
    results = [r for r in _refunds.values() if not r.is_deleted]
    if customer_id:
        results = [r for r in results if r.customer_id == customer_id]
    if nickname:
        q = nickname.lower()
        results = [r for r in results if q in (r.nickname or "").lower()]
    if project_type:
        results = [r for r in results if r.project_type == project_type]
    results.sort(key=lambda r: r.created_at, reverse=True)
    return results


def is_project_refunded(project_type: str, project_id: str) -> bool:
    return any(
        r.project_type == project_type and r.project_id == project_id and not r.is_deleted
        for r in _refunds.values()
    )


def get_available_items(customer_id: str, project_type: str) -> list:
    """返回用户可退费的项目列表（已退费的不返回）"""
    from app.services import (
        membership_card_service, group_case_service, emotional_release_service,
        oh_card_reading_service, energy_knot_service,
    )

    if project_type == "membership-cards":
        cards = membership_card_service.list_cards()
        available = []
        for c in cards:
            if c.customer_id != customer_id or c.is_deleted or c.voided:
                continue
            if is_project_refunded("membership-cards", c.id):
                continue
            available.append({
                "id": c.id,
                "name": c.card_type,
                "paid_amount": c.price,
                "detail": f"¥{c.price}",
                "card_type": c.card_type,
            })
        return available

    elif project_type == "group-cases":
        cases = group_case_service.list_cases()
        items = [c for c in cases if c.customer_id == customer_id and not c.is_deleted]
        return [{
            "id": c.id,
            "name": f"觉醒游戏（{c.purchase_count}次）",
            "paid_amount": c.amount,
            "detail": f"¥{c.amount}",
        } for c in items if not is_project_refunded("group-cases", c.id)]

    elif project_type == "emotional-releases":
        releases = emotional_release_service.list_releases()
        items = [r for r in releases if r.customer_id == customer_id and not r.is_deleted]
        return [{
            "id": r.id,
            "name": f"情绪释放（{r.purchase_count}次）",
            "paid_amount": r.amount,
            "detail": f"¥{r.amount}",
        } for r in items if not is_project_refunded("emotional-releases", r.id)]

    elif project_type == "oh-card-readings":
        readings = oh_card_reading_service.list_readings()
        items = [r for r in readings if r.customer_id == customer_id and not r.is_deleted]
        return [{
            "id": r.id,
            "name": f"OH卡梳理（{r.purchase_count}次）",
            "paid_amount": r.amount,
            "detail": f"¥{r.amount}",
        } for r in items if not is_project_refunded("oh-card-readings", r.id)]

    elif project_type == "energy-knots":
        knots = energy_knot_service.list_knots()
        items = [k for k in knots if k.customer_id == customer_id and not k.is_deleted]
        return [{
            "id": k.id,
            "name": f"能量结（{k.purchase_count}次）",
            "paid_amount": k.amount,
            "detail": f"¥{k.amount}",
        } for k in items if not is_project_refunded("energy-knots", k.id)]

    elif project_type == "other-projects":
        from app.services import other_project_service
        projects = other_project_service.list_projects()
        items = [p for p in projects if p.customer_id == customer_id and not p.is_deleted]
        return [{
            "id": p.id,
            "name": p.project_name,
            "paid_amount": p.fee,
            "detail": f"¥{p.fee}",
            "category": p.category,
        } for p in items if not is_project_refunded("other-projects", p.id)]

    return []


def create_refund(data: ProjectRefundCreate) -> ProjectRefund:
    customer = customer_service.get_customer(data.customer_id)
    if not customer:
        raise ValueError("客户不存在")

    # 获取项目信息和已付金额
    project_name = ""
    paid_amount = data.refund_amount  # fallback

    if data.project_type == "membership-cards":
        from app.services import membership_card_service
        card = membership_card_service.get_card(data.project_id)
        if not card or card.is_deleted:
            raise ValueError("会员卡不存在")
        if card.voided:
            raise ValueError("该卡已作废，无法退费")
        if is_project_refunded("membership-cards", data.project_id):
            raise ValueError("该卡已退费")
        project_name = card.card_type
        paid_amount = card.price
        # 标记卡为已作废：不再可用于扣费，已扣次数不返还
        membership_card_service.void_card(data.project_id)

    elif data.project_type == "other-projects":
        from app.services import other_project_service
        project = other_project_service.get_project(data.project_id)
        if not project or project.is_deleted:
            raise ValueError("项目不存在")
        if is_project_refunded("other-projects", data.project_id):
            raise ValueError("该项目已退费")
        project_name = project.project_name
        paid_amount = project.fee

    else:
        type_labels = {
            "group-cases": "觉醒游戏",
            "emotional-releases": "情绪释放",
            "oh-card-readings": "OH卡梳理",
            "energy-knots": "能量结",
        }
        project_name = type_labels.get(data.project_type, data.project_type)

        if is_project_refunded(data.project_type, data.project_id):
            raise ValueError("该项目已退费")

        # 获取已付金额
        from app.services import (
            group_case_service, emotional_release_service,
            oh_card_reading_service, energy_knot_service,
        )
        svc_map = {
            "group-cases": (group_case_service, "get_case"),
            "emotional-releases": (emotional_release_service, "get_release"),
            "oh-card-readings": (oh_card_reading_service, "get_reading"),
            "energy-knots": (energy_knot_service, "get_knot"),
        }
        if data.project_type in svc_map:
            svc, method = svc_map[data.project_type]
            item = getattr(svc, method)(data.project_id)
            if item and hasattr(item, "amount"):
                paid_amount = item.amount

    if data.refund_amount > paid_amount:
        raise ValueError(f"退费金额不能超过已付金额（¥{paid_amount}）")
    if data.refund_amount <= 0:
        raise ValueError("退费金额必须大于 0")

    now = datetime.now(timezone.utc)
    refund = ProjectRefund(
        id=str(uuid.uuid4())[:8],
        customer_id=data.customer_id,
        nickname=customer.nickname,
        project_type=data.project_type,
        project_id=data.project_id,
        project_name=project_name,
        paid_amount=paid_amount,
        refund_amount=data.refund_amount,
        refund_date=now.strftime("%Y-%m-%d"),
        operator_name=data.operator_name,
        created_at=now,
    )
    _refunds[refund.id] = refund
    _save(refund.id)
    return refund


def update_refund(refund_id: str, refund_amount: float, operator_name: str = "") -> ProjectRefund:
    refund = _refunds.get(refund_id)
    if not refund or refund.is_deleted:
        raise ValueError("记录不存在")
    if refund_amount <= 0:
        raise ValueError("退费金额必须大于 0")
    if refund_amount > refund.paid_amount:
        raise ValueError(f"退费金额不能超过已付金额（¥{refund.paid_amount}）")
    refund.refund_amount = refund_amount
    refund.operator_name = operator_name
    _refunds[refund_id] = refund
    _save(refund_id)
    return refund


def delete_refund(refund_id: str) -> None:
    refund = _refunds.get(refund_id)
    if not refund or refund.is_deleted:
        raise ValueError("记录不存在")
    refund.is_deleted = True
    _refunds[refund_id] = refund
    _save(refund_id)
    # 撤销退费：恢复会员卡为可用
    if refund.project_type == "membership-cards":
        from app.services import membership_card_service
        membership_card_service.unvoid_card(refund.project_id)
