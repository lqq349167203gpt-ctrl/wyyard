from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.base import StrictBaseModel
from app.models.position import PositionCreate, PositionUpdate
from app.services import position_service

router = APIRouter(prefix="/api/positions", tags=["positions"])
require_account_manager = require_page_permission("position-management")


class PositionReorderRequest(StrictBaseModel):
    ids: list[str]
    moved_id: str = ""
    from_position: int = 0
    to_position: int = 0


@router.get("")
async def list_positions():
    return position_service.list_positions()


@router.post("")
async def create_position(data: PositionCreate, _manager_role: str = Depends(require_account_manager)):
    try:
        return position_service.create_position(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/reorder")
async def reorder_positions(
    data: PositionReorderRequest,
    request: Request,
    _manager_role: str = Depends(require_account_manager),
):
    before = position_service.list_positions()
    before_by_id = {position.id: position for position in before}
    try:
        positions = position_service.reorder_positions(data.ids)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    moved = before_by_id.get(data.moved_id)
    if moved:
        request.state.operation_log_context = {
            "content": f"调整角色顺序：将「{moved.name}」从第 {data.from_position} 位移动到第 {data.to_position} 位",
            "entity_id": moved.id,
            "before_data": {"roles": [position.name for position in before]},
            "after_data": {"roles": [position.name for position in positions]},
        }
    return positions


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
