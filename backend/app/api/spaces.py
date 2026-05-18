from fastapi import APIRouter, HTTPException

from app.models.space import SpaceCreate, RoomCreate
from app.services import space_service

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


@router.get("")
async def list_spaces():
    return space_service.list_spaces()


@router.post("")
async def create_space(data: SpaceCreate):
    return space_service.create_space(data)


@router.patch("/{space_id}")
async def update_space(space_id: str, data: dict):
    result = space_service.update_space(space_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="空间不存在")
    return result


@router.delete("/{space_id}")
async def delete_space(space_id: str):
    if not space_service.delete_space(space_id):
        raise HTTPException(status_code=404, detail="空间不存在")
    return {"message": "已删除"}


@router.post("/{space_id}/rooms")
async def add_room(space_id: str, data: RoomCreate):
    room = space_service.add_room(space_id, data)
    if not room:
        raise HTTPException(status_code=404, detail="空间不存在")
    return room


@router.delete("/{space_id}/rooms/{room_id}")
async def delete_room(space_id: str, room_id: str):
    if not space_service.delete_room(space_id, room_id):
        raise HTTPException(status_code=404, detail="房间不存在")
    return {"message": "已删除"}
