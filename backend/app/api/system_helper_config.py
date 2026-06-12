from fastapi import APIRouter

from app.models.system_helper_config import SystemHelperConfigUpdate
from app.models.ai_config import PROVIDER_DEFAULTS
from app.services import system_helper_config_service

router = APIRouter(prefix="/api/system-helper-config", tags=["system-helper-config"])


@router.get("")
async def get_config():
    return system_helper_config_service.get_config()


@router.get("/providers")
async def list_providers():
    return PROVIDER_DEFAULTS


@router.patch("")
async def update_config(data: SystemHelperConfigUpdate):
    return system_helper_config_service.update_config(data)
