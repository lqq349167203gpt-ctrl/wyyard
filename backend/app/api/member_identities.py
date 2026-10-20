import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request

from app.models.member_identity import MemberIdentityCreate, MemberIdentityUpdate
from app.services import member_identity_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/member-identities", tags=["member-identities"])


@router.get("")
def list_identities(group: Literal["identity", "card_status", "all"] = "identity"):
    return member_identity_service.list_identities(group)


@router.post("")
def create_identity(data: MemberIdentityCreate):
    try:
        result = member_identity_service.create_identity(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        member_identity_service.refresh_all()
    except Exception as e:
        logger.error(f"刷新用户身份失败: {e}")
    return result


@router.put("/{identity_id}")
def update_identity(identity_id: str, data: MemberIdentityUpdate):
    try:
        identity = member_identity_service.update_identity(identity_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not identity:
        raise HTTPException(status_code=404, detail="记录不存在")
    try:
        member_identity_service.refresh_all()
    except Exception as e:
        logger.error(f"刷新用户身份失败: {e}")
    return identity


@router.delete("/{identity_id}")
def delete_identity(identity_id: str):
    if not member_identity_service.delete_identity(identity_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    try:
        member_identity_service.refresh_all()
    except Exception as e:
        logger.error(f"刷新用户身份失败: {e}")
    return {"message": "删除成功"}


@router.put("/batch/reorder")
def reorder_identities(data: dict, request: Request = None):
    """批量更新排序，body: {"ids": ["id1", "id2", ...]}"""
    ids = data.get("ids", [])
    try:
        changes = member_identity_service.reorder(ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # 记录详细操作日志
    if changes:
        from app.models.operation_log import OperationLogCreate
        from app.services.operation_log_service import create_log
        operator = ""
        operator_role = ""
        if request:
            user_id = getattr(request.state, "user_id", "")
            if user_id:
                try:
                    from app.services import account_service
                    account = account_service.get_account(user_id)
                    if account:
                        operator = account.owner or account.username
                        operator_role = account.role
                except Exception:
                    pass
        content = f"更新会员身份排序（{', '.join(changes)}）"
        create_log(OperationLogCreate(section="会员身份", content=content), extra={
            "operator": operator,
            "operator_role": operator_role,
            "method": "PUT",
            "path": "/api/member-identities/batch/reorder",
            "ip": request.client.host if request and request.client else "",
        })
    try:
        member_identity_service.refresh_all()
    except Exception as e:
        logger.error(f"刷新用户身份失败: {e}")
    return {"message": "排序更新完成"}


@router.post("/refresh-all")
def refresh_all(request: Request):
    member_identity_service.refresh_all()
    # 记录操作日志
    from app.models.operation_log import OperationLogCreate
    from app.services.operation_log_service import create_log
    operator = ""
    operator_role = ""
    user_id = getattr(request.state, "user_id", "")
    if user_id:
        try:
            from app.services import account_service
            account = account_service.get_account(user_id)
            if account:
                operator = account.owner or account.username
                operator_role = account.role
        except Exception:
            pass
    create_log(OperationLogCreate(section="会员身份", content="刷新全部用户身份"), extra={
        "operator": operator,
        "operator_role": operator_role,
        "method": "POST",
        "path": "/api/member-identities/refresh-all",
        "ip": request.client.host if request.client else "",
    })
    return {"message": "刷新完成"}


@router.post("/card-status/preset")
def create_card_status_presets():
    if member_identity_service.list_identities("card_status"):
        raise HTTPException(status_code=409, detail="本组已有标签，请直接编辑现有配置")
    definitions = [
        ("卡次充足", "range", 6, None, "neutral"),
        ("即将用完", "range", 1, 5, "warning"),
        ("次数用完", "range", 0, 0, "warning"),
        ("不限次数", "unlimited", 0, None, "neutral"),
        ("尚未办卡", "never", 0, None, "neutral"),
        ("会员卡过期", "expired", 0, None, "warning"),
        ("尚未生效", "pending", 0, None, "neutral"),
        ("卡已作废", "voided", 0, None, "neutral"),
    ]
    data = [MemberIdentityCreate(
            name=name, group="card_status", tone=tone,
            conditions=[{"type": "remaining", "remaining_state": state, "remaining_min": lower, "remaining_max": upper}],
        ) for name, state, lower, upper, tone in definitions]
    try:
        return member_identity_service.create_card_status_batch(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
