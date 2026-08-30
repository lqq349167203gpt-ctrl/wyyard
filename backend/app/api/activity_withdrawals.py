from typing import Literal

from fastapi import APIRouter, HTTPException, Request

from app.models.base import StrictBaseModel
from app.services import activity_withdrawal_service, customer_access_service
from app.services.customer_service import get_customer
from app.utils.record_ownership import ensure_record_creator

router = APIRouter(prefix="/api/activity-withdrawals", tags=["activity-withdrawals"])

ActivityRecordType = Literal["class", "gcs", "ers", "eks", "ics"]


class ActivityWithdrawalCreate(StrictBaseModel):
    customer_id: str


def _operator(request: Request) -> tuple[str, str]:
    operator_id = getattr(request.state, "user_id", "") or ""
    operator = (
        getattr(request.state, "user_owner", "")
        or getattr(request.state, "user_name", "")
        or ""
    )
    return operator_id, operator


def _remove_client_signup(record_id: str, customer_id: str) -> None:
    """退课后移除客户端报名流水；课表名单仍保留退课历史。"""
    from app.services.storage import delete_item, load_data, save_item

    signups_data = load_data("client_signups.json")
    for signup_id, signup in signups_data.items():
        if isinstance(signup, dict):
            if signup.get("activity_id") == record_id and signup.get("customer_id") == customer_id:
                delete_item("client_signups.json", signup_id)
        elif isinstance(signup, list):
            retained = [
                item
                for item in signup
                if not (
                    isinstance(item, dict)
                    and item.get("activity_id") == record_id
                    and item.get("customer_id") == customer_id
                )
            ]
            if len(retained) != len(signup):
                save_item("client_signups.json", signup_id, retained)


@router.post("/{record_type}/{record_id}")
def withdraw_participant(
    record_type: ActivityRecordType,
    record_id: str,
    data: ActivityWithdrawalCreate,
    request: Request,
):
    record = activity_withdrawal_service.get_record(record_type, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="活动记录不存在")
    ensure_record_creator(request, record, "活动", "activities")
    customer_access_service.require_new_customer_ids(
        request,
        [data.customer_id],
        action="办理退课",
    )
    customer = get_customer(data.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")

    before_data = record.model_dump(mode="json")
    operator_id, operator = _operator(request)
    try:
        updated, changed = activity_withdrawal_service.withdraw_participant(
            record_type,
            record_id,
            data.customer_id,
            operator_id,
            operator,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not updated:
        raise HTTPException(status_code=404, detail="活动记录不存在")

    activity_name = activity_withdrawal_service.activity_name(record_type, updated)
    customer_name = customer.nickname or customer.name or "未命名客户"
    _remove_client_signup(record_id, data.customer_id)

    if changed:
        from app.services import client_notification_service

        client_notification_service.create_notification(
            customer_id=data.customer_id,
            type="signup_cancelled",
            title="退课已办理",
            content=f'您在"{activity_name}"（{updated.date}）的退课已办理',
            activity_name=activity_name,
            activity_date=updated.date,
            operator=operator,
        )

    request.state.operation_log_context = {
        "content": (
            f"办理退课：{customer_name} · "
            f"{activity_withdrawal_service.ACTIVITY_TYPE_LABELS[record_type]} · "
            f"{activity_name}（{updated.date}）"
        ),
        "entity_id": record_id,
        "before_data": before_data,
        "after_data": updated.model_dump(mode="json"),
    }
    return updated


@router.delete("/{record_type}/{record_id}/{customer_id}")
def restore_participant(
    record_type: ActivityRecordType,
    record_id: str,
    customer_id: str,
    request: Request,
):
    record = activity_withdrawal_service.get_record(record_type, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="活动记录不存在")
    ensure_record_creator(request, record, "活动", "activities")
    customer_access_service.require_new_customer_ids(
        request,
        [customer_id],
        action="恢复退课",
    )
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")

    before_data = record.model_dump(mode="json")
    operator_id, operator = _operator(request)
    try:
        updated, changed = activity_withdrawal_service.cancel_withdrawal(
            record_type,
            record_id,
            customer_id,
            operator_id,
            operator,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not updated:
        raise HTTPException(status_code=404, detail="活动记录不存在")
    if not changed:
        raise HTTPException(status_code=404, detail="该客户未办理退课")

    activity_name = activity_withdrawal_service.activity_name(record_type, updated)
    customer_name = customer.nickname or customer.name or "未命名客户"
    from app.services import client_notification_service

    client_notification_service.create_notification(
        customer_id=customer_id,
        type="activity_changed",
        title="退课已恢复",
        content=f'您在"{activity_name}"（{updated.date}）的参与状态已恢复',
        activity_name=activity_name,
        activity_date=updated.date,
        operator=operator,
    )

    request.state.operation_log_context = {
        "content": (
            f"恢复退课：{customer_name} · "
            f"{activity_withdrawal_service.ACTIVITY_TYPE_LABELS[record_type]} · "
            f"{activity_name}（{updated.date}）"
        ),
        "entity_id": record_id,
        "before_data": before_data,
        "after_data": updated.model_dump(mode="json"),
    }
    return updated
