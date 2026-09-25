from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.base import SafeBaseModel
from app.services import (
    customer_access_service,
    debt_review_service,
    emotional_release_session_service,
    energy_knot_session_service,
    group_case_session_service,
    membership_card_service,
)

router = APIRouter(
    prefix="/api/debt-records",
    tags=["debt-records"],
    dependencies=[Depends(require_page_permission("debt-records"))],
)


class DebtReviewUpdate(SafeBaseModel):
    action: Literal["confirm", "reset"]
    note: str = ""


def _raw_records(debt_type: str) -> list[dict]:
    if debt_type == "membership_card":
        return membership_card_service.list_debt_records()
    if debt_type == "group_case":
        return group_case_session_service.list_debt_customers()
    if debt_type == "emotional_release":
        return emotional_release_session_service.list_debt_customers()
    if debt_type == "energy_knot":
        return energy_knot_session_service.list_debt_customers()
    raise HTTPException(status_code=400, detail="不支持的欠卡类型")


def _actor(request: Request) -> str:
    return getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""


@router.get("/summary")
def get_debt_review_summary(request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    result = {}
    for debt_type in ("membership_card", "group_case", "emotional_release", "energy_knot"):
        states = debt_review_service.sync(debt_type, _raw_records(debt_type))
        visible = customer_access_service.filter_record_dicts(request, states)
        result[debt_type] = sum(item.get("new_count", 0) for item in visible if item.get("status") in ("new", "changed"))
    return result


@router.get("")
async def list_debt_records(
    request: Request,
    type: str = Query(..., description="欠卡类型: membership_card, group_case, emotional_release, energy_knot"),
    status: Literal["attention", "ok", "resolved", "all"] = "attention",
):
    customer_access_service.require_transaction_access(request, detail=True)
    states = debt_review_service.sync(type, _raw_records(type))
    visible = customer_access_service.filter_record_dicts(request, states)
    counts = {
        "attention": sum(1 for item in visible if item.get("status") in ("new", "changed")),
        "ok": sum(1 for item in visible if item.get("status") == "ok"),
        "resolved": sum(1 for item in visible if item.get("status") == "resolved"),
    }
    customer_debt_totals: dict[str, int] = {}
    customer_pending_totals: dict[str, int] = {}
    for item in visible:
        if item.get("status") == "resolved":
            continue
        customer_id = item.get("customer_id") or ""
        customer_debt_totals[customer_id] = customer_debt_totals.get(customer_id, 0) + int(item.get("debt_count") or 0)
        if item.get("status") in ("new", "changed"):
            customer_pending_totals[customer_id] = customer_pending_totals.get(customer_id, 0) + int(item.get("new_count") or 0)
    counts["all"] = len(visible)
    items = visible if status == "all" else [
        item for item in visible
        if (item.get("status") in ("new", "changed") if status == "attention" else item.get("status") == status)
    ]
    status_order = {"changed": 0, "new": 1, "ok": 2, "resolved": 3}
    items.sort(key=lambda item: item.get("nickname") or "")
    items.sort(key=lambda item: item.get("course_name") or "")
    items.sort(key=lambda item: item.get("course_date") or "", reverse=True)
    items.sort(key=lambda item: status_order.get(item.get("status"), 9))
    return {
        "items": items,
        "counts": counts,
        "customer_debt_totals": customer_debt_totals,
        "customer_pending_totals": customer_pending_totals,
        "total": len(items),
    }


@router.patch("/{review_id}")
def update_debt_review(review_id: str, data: DebtReviewUpdate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = debt_review_service.get(review_id)
    if not existing:
        raise HTTPException(status_code=404, detail="欠卡监管记录不存在")
    customer_access_service.require_customer_scope(
        request,
        existing.get("customer_id") or "",
        action="处理该客户的欠卡记录",
    )
    previous = {"status": existing.get("status"), "note": existing.get("note") or ""}
    updated = debt_review_service.review(review_id, data.action, data.note, _actor(request))
    if not updated:
        raise HTTPException(status_code=400, detail="已结清的欠卡不能修改状态")
    if previous == {"status": updated.get("status"), "note": updated.get("note") or ""}:
        request.state.skip_operation_log = True
    else:
        action_name = "确认客户课程欠卡" if data.action == "confirm" else "撤销客户课程欠卡确认"
        request.state.operation_log_context = {
            "entity_id": review_id,
            "content": (
                f"{action_name}：{updated.get('nickname') or '未命名客户'} · "
                f"{updated.get('course_name') or '未命名课程'} · {updated.get('course_date') or '日期未填写'}"
            ),
            "before_data": previous,
            "after_data": {"status": updated.get("status"), "note": updated.get("note") or ""},
        }
    return updated


@router.post("/baseline/{debt_type}")
def establish_debt_baseline(debt_type: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    states = debt_review_service.sync(debt_type, _raw_records(debt_type))
    visible = customer_access_service.filter_record_dicts(request, states)
    review_ids = [
        item["id"] for item in visible
        if item.get("status") in ("new", "changed")
    ]
    changed = debt_review_service.establish_baseline(review_ids, _actor(request))
    if not changed:
        request.state.skip_operation_log = True
    else:
        request.state.operation_log_context = {
            "entity_id": debt_type,
            "content": f"建立欠卡监管基线：确认 {changed} 条客户课程欠卡",
            "before_data": {"unconfirmed_person_course_count": changed},
            "after_data": {"confirmed_person_course_count": changed},
        }
    return {"updated": changed}
