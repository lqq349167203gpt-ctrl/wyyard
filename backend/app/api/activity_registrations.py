from fastapi import APIRouter, HTTPException, Request
from app.models.activity_registration import ActivityRegistrationCreate
from app.services import activity_registration_service

router = APIRouter(prefix="/api/activity-registrations", tags=["activity-registrations"])


@router.get("/my")
def my_registrations(request: Request):
    """获取当前客户的报名列表"""
    customer_id = getattr(request.state, "customer_id", "")
    if not customer_id:
        raise HTTPException(status_code=403, detail="仅客户可访问")
    return [r.model_dump(mode="json") for r in activity_registration_service.list_my_registrations(customer_id)]


@router.post("")
def register(data: ActivityRegistrationCreate, request: Request):
    """客户报名活动"""
    customer_id = getattr(request.state, "customer_id", "")
    if not customer_id:
        raise HTTPException(status_code=403, detail="仅客户可报名")
    try:
        reg = activity_registration_service.register(customer_id, data)
        return reg.model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{registration_id}")
def cancel(registration_id: str, request: Request):
    """取消报名"""
    customer_id = getattr(request.state, "customer_id", "")
    if not customer_id:
        raise HTTPException(status_code=403, detail="仅客户可操作")
    success = activity_registration_service.cancel(registration_id, customer_id)
    if not success:
        raise HTTPException(status_code=404, detail="报名记录不存在")
    return {"message": "取消成功"}
