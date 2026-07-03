from fastapi import APIRouter

from app.models.customer_ai_config import CustomerAIConfigUpdate
from app.services import customer_ai_config_service

router = APIRouter(prefix="/api/customer-ai-config", tags=["customer-ai-config"])


@router.get("")
async def get_config():
    config = customer_ai_config_service.get_config()
    return config.model_dump(mode="json")


@router.patch("")
async def update_config(data: CustomerAIConfigUpdate):
    result = customer_ai_config_service.update_config(data)
    return result.model_dump(mode="json")
