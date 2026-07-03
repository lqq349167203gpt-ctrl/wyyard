from fastapi import APIRouter

from app.models.activity_ai_config import ActivityAIConfigUpdate
from app.services import activity_ai_config_service

router = APIRouter(prefix="/api/activity-ai-config", tags=["activity-ai-config"])


@router.get("")
async def get_config():
    config = activity_ai_config_service.get_config()
    return config.model_dump(mode="json")


@router.patch("")
async def update_config(data: ActivityAIConfigUpdate):
    result = activity_ai_config_service.update_config(data)
    return result.model_dump(mode="json")
