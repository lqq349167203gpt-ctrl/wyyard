from fastapi import APIRouter

from app.models.visit_ai_config import VisitAIConfigUpdate
from app.services import visit_ai_config_service

router = APIRouter(prefix="/api/visit-ai-config", tags=["visit-ai-config"])


@router.get("")
async def get_config():
    config = visit_ai_config_service.get_config()
    return config.model_dump(mode="json")


@router.patch("")
async def update_config(data: VisitAIConfigUpdate):
    result = visit_ai_config_service.update_config(data)
    return result.model_dump(mode="json")
