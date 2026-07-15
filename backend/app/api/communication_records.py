from fastapi import APIRouter, Request, HTTPException, Query
from app.models.communication_record import CommunicationRecordCreate
from app.services import communication_record_service

router = APIRouter(prefix="/api/communication-records", tags=["communication-records"])


@router.get("")
def list_communication_records(customer_nickname: str = Query(None)):
    records = communication_record_service.list_records()
    if customer_nickname:
        records = [r for r in records if r.customer_nickname == customer_nickname]
    return records


@router.post("")
def create_communication_record(data: CommunicationRecordCreate, request: Request):
    creator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    return communication_record_service.create_record(data, creator)


@router.put("/{record_id}")
def update_communication_record(record_id: str, data: CommunicationRecordCreate):
    record = communication_record_service.update_record(record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@router.delete("/{record_id}")
def delete_communication_record(record_id: str):
    if not communication_record_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"ok": True}
