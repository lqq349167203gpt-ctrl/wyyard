from fastapi import APIRouter, HTTPException
from app.models.position import PositionCreate
from app.services import position_service

router = APIRouter(prefix="/api/positions", tags=["positions"])


@router.get("")
async def list_positions():
    return position_service.list_positions()


@router.post("")
async def create_position(data: PositionCreate):
    return position_service.create_position(data)


@router.patch("/{position_id}")
async def update_position(position_id: str, data: dict):
    result = position_service.update_position(position_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="身份不存在")
    return result


@router.delete("/{position_id}")
async def delete_position(position_id: str):
    if not position_service.delete_position(position_id):
        raise HTTPException(status_code=404, detail="身份不存在")
    return {"message": "已删除"}
