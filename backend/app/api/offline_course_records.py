import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field

from app.middleware.jwt_auth import require_page_permission
from app.models.base import StrictBaseModel
from app.models.offline_course_record import OfflineCourseRecordCreate
from app.services import customer_access_service, customer_service, offline_course_record_service
from app.services.storage import commit_pending_writes, delete_item, load_data, save_item

router = APIRouter(prefix="/api/offline-course-records", tags=["offline-course-records"])

TYPE_FILE = "offline_course_record_types.json"


class CourseTypeCreate(StrictBaseModel):
    name: str = Field(min_length=1, max_length=50)


@router.get("/types")
def list_types(_role: str = Depends(require_page_permission("offline-course-records"))):
    return list(load_data(TYPE_FILE).values())


@router.post("/types")
def create_type(data: CourseTypeCreate, request: Request, _role: str = Depends(require_page_permission("offline-course-types"))):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "类型名称不能为空")
    if any(item["name"] == name for item in load_data(TYPE_FILE).values()):
        raise HTTPException(409, "此类型已存在")
    item = {"id": str(uuid.uuid4()), "name": name}
    save_item(TYPE_FILE, item["id"], item)
    request.state.operation_log_context = {"content": f"新增落地课程类型：{name}", "after_data": {"类型名称": name}}
    return item


@router.put("/types/{type_id}")
def update_type(type_id: str, data: CourseTypeCreate, request: Request, _role: str = Depends(require_page_permission("offline-course-types"))):
    types = load_data(TYPE_FILE)
    old = types.get(type_id)
    if not old:
        raise HTTPException(404, "课程类型不存在")
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "类型名称不能为空")
    if any(t["name"] == name and t["id"] != type_id for t in types.values()):
        raise HTTPException(409, "此类型已存在")
    item = {**old, "name": name}
    updated = [r.model_copy(update={"course_type": name}) for r in offline_course_record_service.list_records() if r.course_type == old["name"]]
    writes = [("item", TYPE_FILE, type_id, item)]
    writes.extend(("item", offline_course_record_service.FILENAME, r.id, r.model_dump(mode="json")) for r in updated)
    commit_pending_writes(writes)
    offline_course_record_service._records.update({r.id: r for r in updated})
    request.state.operation_log_context = {"content": f"修改落地课程类型：{old['name']} → {name}", "before_data": {"类型名称": old["name"]}, "after_data": {"类型名称": name}}
    return item


@router.delete("/types/{type_id}")
def delete_type(type_id: str, request: Request, _role: str = Depends(require_page_permission("offline-course-types"))):
    item = load_data(TYPE_FILE).get(type_id)
    if not item:
        raise HTTPException(404, "课程类型不存在")
    if any(r.course_type == item["name"] for r in offline_course_record_service.list_records()):
        raise HTTPException(409, "此类型已有课程记录，不能删除；可修改类型名称")
    delete_item(TYPE_FILE, type_id)
    request.state.operation_log_context = {"content": f"删除落地课程类型：{item['name']}", "before_data": {"类型名称": item["name"]}}
    return {"ok": True}


def normalize(data: OfflineCourseRecordCreate, request: Request):
    if "participant_ids" in data.model_fields_set:
        if not data.teacher.strip():
            raise HTTPException(400, "请选择课程老师")
        try:
            date.fromisoformat(data.record_date)
        except ValueError:
            raise HTTPException(400, "请选择有效的课程日期")
        ids = list(dict.fromkeys(data.participant_ids))
        customer_access_service.require_new_customer_ids(request, ids, action="录入落地课程参与者")
        people = [customer_service.get_customer(cid) for cid in ids]
        if any(p is None for p in people):
            raise HTTPException(400, "部分参与者已不存在，请重新选择")
        data = data.model_copy(update={"participant_ids": ids, "participant_names": [p.nickname or p.name for p in people]})
    if data.course_type and not any(t["name"] == data.course_type for t in load_data(TYPE_FILE).values()):
        raise HTTPException(400, "课程类型不存在，请重新选择")
    return data


def log_record(request, action, record, before=None):
    def snapshot(r):
        return {"课程名称": r.course_name, "课程日期": r.record_date, "课程老师": r.teacher, "课程类型": r.course_type, "参与者": "、".join(r.participant_names) or r.customer_nickname, "课程内容": r.content, "课程结果": r.result}
    request.state.operation_log_context = {"entity_id": record.id, "content": f"{action}落地课程：{record.record_date} · {record.course_name or '未填写课程名称'} · {record.course_type or '未设置类型'} · 老师：{record.teacher or '-'} · 参与者：{'、'.join(record.participant_names) or record.customer_nickname or '-'}", "before_data": snapshot(before) if before else None, "after_data": snapshot(record) if action != "删除" else None}


@router.get("")
def list_offline_course_records(customer_id: str = Query(None)):
    return offline_course_record_service.list_records(customer_id)


@router.post("")
def create_offline_course_record(data: OfflineCourseRecordCreate, request: Request):
    creator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    record = offline_course_record_service.create_record(normalize(data, request), creator)
    log_record(request, "新增", record)
    return record


@router.put("/{record_id}")
def update_offline_course_record(record_id: str, data: OfflineCourseRecordCreate, request: Request):
    before = offline_course_record_service.get_record(record_id)
    record = offline_course_record_service.update_record(record_id, normalize(data, request))
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    log_record(request, "修改", record, before)
    return record


@router.delete("/{record_id}")
def delete_offline_course_record(record_id: str, request: Request):
    before = offline_course_record_service.get_record(record_id)
    if not offline_course_record_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    log_record(request, "删除", before, before)
    return {"ok": True}
