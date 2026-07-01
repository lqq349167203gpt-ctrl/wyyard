from fastapi import APIRouter

from app.models.customer_ai_config import CustomerAIConfigUpdate
from app.models.ai_config import PROVIDER_DEFAULTS
from app.services import customer_ai_config_service

router = APIRouter(prefix="/api/customer-ai-config", tags=["customer-ai-config"])


def _mask_api_key(key: str) -> str:
    if not key or len(key) <= 8:
        return key
    return key[:4] + "****" + key[-4:]


@router.get("")
async def get_config():
    config = customer_ai_config_service.get_config()
    data = config.model_dump(mode="json")
    if data.get("api_key"):
        data["api_key"] = _mask_api_key(data["api_key"])
    return data


@router.get("/providers")
async def list_providers():
    return PROVIDER_DEFAULTS


@router.patch("")
async def update_config(data: CustomerAIConfigUpdate):
    return customer_ai_config_service.update_config(data)
