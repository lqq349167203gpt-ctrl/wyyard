from fastapi import APIRouter

from app.models.miniapp_ai_config import MiniappAIConfigUpdate
from app.models.ai_config import PROVIDER_DEFAULTS
from app.services import miniapp_ai_config_service

router = APIRouter(prefix="/api/miniapp-ai-config", tags=["miniapp-ai-config"])


@router.get("")
async def get_config():
    config = miniapp_ai_config_service.get_config()
    data = config.model_dump(mode="json")
    has_key = bool(data.get("api_key"))
    data["api_key"] = ""
    data["has_api_key"] = has_key
    return data


@router.get("/providers")
async def list_providers():
    return PROVIDER_DEFAULTS


@router.patch("")
async def update_config(data: MiniappAIConfigUpdate):
    update_data = data.model_dump(exclude_unset=True)
    if "api_key" in update_data and not update_data["api_key"]:
        del update_data["api_key"]
    filtered = MiniappAIConfigUpdate(**update_data)
    result = miniapp_ai_config_service.update_config(filtered)
    out = result.model_dump(mode="json")
    out["api_key"] = ""
    out["has_api_key"] = bool(result.api_key)
    return out
