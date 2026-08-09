from fastapi import APIRouter, Depends, HTTPException

from app.middleware.jwt_auth import require_page_permission
from app.models.position import PositionCreate, PositionUpdate
from app.services import position_service

router = APIRouter(prefix="/api/positions", tags=["positions"])
require_account_manager = require_page_permission("position-management")


@router.get("")
async def list_positions():
    return position_service.list_positions()


@router.post("")
async def create_position(data: PositionCreate, _manager_role: str = Depends(require_account_manager)):
    try:
        return position_service.create_position(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{position_id}")
async def update_position(
    position_id: str,
    data: PositionUpdate,
    _manager_role: str = Depends(require_account_manager),
):
    try:
        result = position_service.update_position(position_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="身份不存在")
    return result


@router.delete("/{position_id}")
async def delete_position(position_id: str, _manager_role: str = Depends(require_account_manager)):
    try:
        if not position_service.delete_position(position_id):
            raise HTTPException(status_code=404, detail="身份不存在")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "已删除"}
