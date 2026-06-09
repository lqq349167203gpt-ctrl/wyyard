from fastapi import APIRouter, HTTPException, Query

from app.models.space import SpaceCreate, RoomCreate
from app.utils.pagination import paginate
from app.services import space_service

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


@router.get("")
async def list_spaces(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = space_service.list_spaces()
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
async def create_space(data: SpaceCreate):
    try:
        return space_service.create_space(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{space_id}")
async def update_space(space_id: str, data: dict):
    try:
        result = space_service.update_space(space_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="空间不存在")
    return result


@router.delete("/{space_id}")
async def delete_space(space_id: str):
    try:
        if not space_service.delete_space(space_id):
            raise HTTPException(status_code=404, detail="空间不存在")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "已删除"}


@router.post("/{space_id}/rooms")
async def add_room(space_id: str, data: RoomCreate):
    try:
        room = space_service.add_room(space_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not room:
        raise HTTPException(status_code=404, detail="空间不存在")
    return room


@router.get("/{space_id}/rooms/{room_id}/referenced")
async def check_room_referenced(space_id: str, room_id: str):
    return {"referenced": space_service.is_room_referenced(room_id)}


@router.patch("/{space_id}/rooms/{room_id}")
async def update_room(space_id: str, room_id: str, data: dict):
    try:
        room = space_service.update_room(space_id, room_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    return room


@router.delete("/{space_id}/rooms/{room_id}")
async def delete_room(space_id: str, room_id: str, force: bool = Query(False)):
    result = space_service.delete_room(space_id, room_id, force=force)
    if not result["success"]:
        if result.get("referenced"):
            raise HTTPException(status_code=409, detail=result["error"])
        raise HTTPException(status_code=404, detail=result["error"])
    return {"message": "已删除", "soft_deleted": result.get("soft_deleted", False)}
