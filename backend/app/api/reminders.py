from fastapi import APIRouter, HTTPException

from app.models.reminder import ReminderCreate
from app.services import reminder_service

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("")
async def list_reminders():
    return reminder_service.list_reminders()


@router.post("")
async def create_reminder(data: ReminderCreate):
    return reminder_service.create_reminder(data)


@router.patch("/{reminder_id}")
async def update_reminder(reminder_id: str, data: dict):
    result = reminder_service.update_reminder(reminder_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="提醒不存在")
    return result


@router.delete("/{reminder_id}")
async def delete_reminder(reminder_id: str):
    if not reminder_service.delete_reminder(reminder_id):
        raise HTTPException(status_code=404, detail="提醒不存在")
    return {"message": "已删除"}
