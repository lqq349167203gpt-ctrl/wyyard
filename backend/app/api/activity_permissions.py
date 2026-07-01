from typing import Dict

from fastapi import APIRouter
from app.models.base import StrictBaseModel

from app.services import activity_permission_service

router = APIRouter(prefix="/api/activity-permissions", tags=["activity-permissions"])


class ActivityPermissionSaveAll(StrictBaseModel):
    permissions: Dict[str, Dict[str, Dict[str, bool]]]


@router.get("")
def get_all():
    return activity_permission_service.get_all()


@router.put("")
def save_all(data: ActivityPermissionSaveAll):
    activity_permission_service.set_all(data.permissions)
    return {"message": "已保存"}
