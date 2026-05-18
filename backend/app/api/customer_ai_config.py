from fastapi import APIRouter

from app.models.customer_ai_config import CustomerAIConfigUpdate
from app.models.ai_config import PROVIDER_DEFAULTS
from app.services import customer_ai_config_service

router = APIRouter(prefix="/api/customer-ai-config", tags=["customer-ai-config"])


@router.get("")
async def get_config():
    return customer_ai_config_service.get_config()


@router.get("/providers")
async def list_providers():
    return PROVIDER_DEFAULTS


@router.patch("")
async def update_config(data: CustomerAIConfigUpdate):
    return customer_ai_config_service.update_config(data)
