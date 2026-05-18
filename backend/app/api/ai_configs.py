from fastapi import APIRouter, HTTPException

from app.models.ai_config import AIConfigCreate, AIConfigUpdate, PROVIDER_DEFAULTS
from app.services import ai_config_service

router = APIRouter(prefix="/api/ai-configs", tags=["ai-configs"])


@router.get("")
async def list_configs():
    return ai_config_service.list_configs()


@router.get("/providers")
async def list_providers():
    return PROVIDER_DEFAULTS


@router.post("")
async def create_config(data: AIConfigCreate):
    return ai_config_service.create_config(data)


@router.patch("/{config_id}")
async def update_config(config_id: str, data: AIConfigUpdate):
    config = ai_config_service.update_config(config_id, data)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return config


@router.delete("/{config_id}")
async def delete_config(config_id: str):
    if not ai_config_service.delete_config(config_id):
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"message": "已删除"}
