import threading
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.other_project_deduction import OtherProjectDeduction, OtherProjectDeductionCreate
from app.services.storage import load_data, save_data, save_item
from app.services import other_project_service

FILENAME = "other_project_deductions.json"
_deductions: Dict[str, OtherProjectDeduction] = {}
_deduct_lock = threading.Lock()


def _load():
    global _deductions
    data = load_data(FILENAME)
    _deductions = {k: OtherProjectDeduction(**v) for k, v in data.items()}


def _save(deduction_id: str = ""):
    if deduction_id:
        item = _deductions.get(deduction_id)
        if item:
            save_item(FILENAME, deduction_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _deductions.items()}
        save_data(FILENAME, data)


_load()


def list_deductions(customer_id: Optional[str] = None) -> List[OtherProjectDeduction]:
    results = [d for d in _deductions.values() if not d.is_deleted]
    if customer_id:
        results = [d for d in results if d.customer_id == customer_id]
    results.sort(key=lambda d: d.created_at, reverse=True)
    _fill_current_remaining(results)
    return results


def _fill_current_remaining(deductions: List[OtherProjectDeduction]):
    """为扣减记录填充当前实际剩余次数"""
    for d in deductions:
        remaining = other_project_service.get_effective_remaining(d.other_project_id)
        d.remaining_after = remaining


def get_available_projects(customer_id: str) -> list:
    """返回用户可销卡的其他项目（有剩余次数且未过期）"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    projects = other_project_service.list_projects()
    available = []
    for p in projects:
        if p.customer_id != customer_id:
            continue
        if p.is_deleted:
            continue
        effective_remaining = other_project_service.get_effective_remaining(p.id)
        if effective_remaining is not None and effective_remaining <= 0:
            continue
        if p.expiry_date and p.expiry_date < today:
            continue
        available.append({
            "id": p.id,
            "project_name": p.project_name,
            "activity_mode": p.activity_mode,
            "remaining_count": effective_remaining,
            "effective_date": p.effective_date,
            "expiry_date": p.expiry_date or "",
            "created_at": p.created_at.strftime("%Y-%m-%d") if hasattr(p.created_at, "strftime") else str(p.created_at),
        })
    return available


def create_deduction(data: OtherProjectDeductionCreate) -> OtherProjectDeduction:
    with _deduct_lock:
        project = other_project_service.get_project(data.other_project_id)
        if not project:
            raise ValueError("项目不存在")
        if project.customer_id != data.customer_id:
            raise ValueError("该项目不属于该客户")
        effective_remaining = other_project_service.get_effective_remaining(data.other_project_id)
        if effective_remaining is not None:
            if effective_remaining < data.count:
                raise ValueError(f"剩余次数不足（剩余 {effective_remaining} 次）")
        remaining_after = (effective_remaining - data.count) if effective_remaining is not None else None

        now = datetime.now(timezone.utc)
        deduction = OtherProjectDeduction(
            id=str(uuid.uuid4())[:12],
            customer_id=data.customer_id,
            nickname=project.nickname,
            other_project_id=data.other_project_id,
            project_name=project.project_name,
            activity_mode=project.activity_mode,
            project_created_at=project.created_at.strftime("%Y-%m-%d") if hasattr(project.created_at, "strftime") else str(project.created_at),
            count=data.count,
            deduction_date=now.strftime("%Y-%m-%d"),
            remaining_after=remaining_after,
            created_at=now,
        )
        _deductions[deduction.id] = deduction
        _save(deduction.id)
        return deduction
