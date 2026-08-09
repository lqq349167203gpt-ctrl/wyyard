from fastapi import APIRouter, Request, HTTPException, Query
from app.models.offline_course_record import OfflineCourseRecordCreate
from app.services import offline_course_record_service

router = APIRouter(prefix="/api/offline-course-records", tags=["offline-course-records"])


@router.get("")
def list_offline_course_records(customer_id: str = Query(None)):
    return offline_course_record_service.list_records(customer_id)


@router.post("")
def create_offline_course_record(data: OfflineCourseRecordCreate, request: Request):
    creator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    return offline_course_record_service.create_record(data, creator)


@router.put("/{record_id}")
def update_offline_course_record(record_id: str, data: OfflineCourseRecordCreate):
    record = offline_course_record_service.update_record(record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@router.delete("/{record_id}")
def delete_offline_course_record(record_id: str):
    if not offline_course_record_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"ok": True}
