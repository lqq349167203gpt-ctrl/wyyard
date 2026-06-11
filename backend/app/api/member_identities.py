from fastapi import APIRouter, HTTPException, Request
from app.services import member_identity_service
from app.models.member_identity import MemberIdentityCreate, MemberIdentityUpdate

router = APIRouter(prefix="/api/member-identities", tags=["member-identities"])


@router.get("")
def list_identities():
    return member_identity_service.list_identities()


@router.post("")
def create_identity(data: MemberIdentityCreate):
    result = member_identity_service.create_identity(data)
    member_identity_service.refresh_all()
    return result


@router.put("/{identity_id}")
def update_identity(identity_id: str, data: MemberIdentityUpdate):
    identity = member_identity_service.update_identity(identity_id, data)
    if not identity:
        raise HTTPException(status_code=404, detail="记录不存在")
    member_identity_service.refresh_all()
    return identity


@router.delete("/{identity_id}")
def delete_identity(identity_id: str):
    if not member_identity_service.delete_identity(identity_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    member_identity_service.refresh_all()
    return {"message": "删除成功"}


@router.put("/batch/reorder")
def reorder_identities(data: dict, request: Request = None):
    """批量更新排序，body: {"ids": ["id1", "id2", ...]}"""
    ids = data.get("ids", [])
    changes = member_identity_service.reorder(ids)
    # 记录详细操作日志
    if changes:
        from app.services.operation_log_service import create_log
        from app.models.operation_log import OperationLogCreate
        operator = ""
        operator_role = ""
        if request:
            user_id = request.headers.get("X-User-Id", "")
            if user_id:
                try:
                    from app.services import account_service
                    account = account_service.get_account(user_id)
                    if account:
                        operator = account.username
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
    return {"message": "排序更新完成"}


@router.post("/refresh-all")
def refresh_all(request: Request):
    member_identity_service.refresh_all()
    # 记录操作日志
    from app.services.operation_log_service import create_log
    from app.models.operation_log import OperationLogCreate
    operator = ""
    operator_role = ""
    user_id = request.headers.get("X-User-Id", "")
    if user_id:
        try:
            from app.services import account_service
            account = account_service.get_account(user_id)
            if account:
                operator = account.username
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
