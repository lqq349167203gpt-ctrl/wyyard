from fastapi import APIRouter, HTTPException

from app.models.ai_config import AIConfigCreate, AIConfigUpdate, PROVIDER_DEFAULTS
from app.services import ai_config_service

router = APIRouter(prefix="/api/ai-configs", tags=["ai-configs"])


def _mask_api_key(key: str) -> str:
    if not key or len(key) <= 8:
        return key
    return key[:4] + "****" + key[-4:]


def _mask_config(config) -> dict:
    data = config.model_dump(mode="json") if hasattr(config, "model_dump") else config
    if "api_key" in data:
        data["api_key"] = _mask_api_key(data["api_key"])
    return data


@router.get("")
async def list_configs():
    configs = ai_config_service.list_configs()
    return [_mask_config(c) for c in configs]


@router.get("/providers")
async def list_providers():
    return PROVIDER_DEFAULTS


@router.post("")
async def create_config(data: AIConfigCreate):
    config = ai_config_service.create_config(data)
    return _mask_config(config)


@router.patch("/{config_id}")
async def update_config(config_id: str, data: AIConfigUpdate):
    config = ai_config_service.update_config(config_id, data)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return _mask_config(config)


@router.delete("/{config_id}")
async def delete_config(config_id: str):
    if not ai_config_service.delete_config(config_id):
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"message": "已删除"}
