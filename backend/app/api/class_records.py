from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services import class_record_service

router = APIRouter(prefix="/api/class-records", tags=["class-records"])


@router.get("")
def list_records(date: Optional[str] = None):
    return class_record_service.list_records(date)


@router.post("")
def create_record(data: dict):
    from app.models.class_record import ClassRecordCreate
    try:
        record = ClassRecordCreate(**data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return class_record_service.create_record(record)


@router.patch("/{record_id}")
def update_record(record_id: str, data: dict):
    record = class_record_service.update_record(record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


class ParticipantUpdate(BaseModel):
    participant_ids: List[str]


@router.patch("/{record_id}/participants")
def update_participants(record_id: str, data: ParticipantUpdate):
    record, warnings = class_record_service.update_participants(record_id, data.participant_ids)
    if not record:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")
    result = record.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.patch("/{record_id}/groups")
def update_groups(record_id: str, data: dict):
    groups = data.get("groups", [])
    record, warnings = class_record_service.update_groups(record_id, groups)
    if not record:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")
    result = record.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.delete("/{record_id}")
def delete_record(record_id: str):
    if not class_record_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return class_record_service.search_customers(q)
