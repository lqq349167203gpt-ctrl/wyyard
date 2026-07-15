from fastapi import APIRouter, Request
from app.models.communication_record import CommunicationRecordCreate
from app.services import communication_record_service

router = APIRouter(prefix="/api/communication-records", tags=["communication-records"])


@router.get("")
def list_communication_records():
    return communication_record_service.list_records()


@router.post("")
def create_communication_record(data: CommunicationRecordCreate, request: Request):
    creator = ""
    user = getattr(request.state, "user", None)
    if user:
        creator = getattr(user, "name", "") or getattr(user, "username", "")
    return communication_record_service.create_record(data, creator)
