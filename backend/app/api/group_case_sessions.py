from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.group_case_session import GroupCaseSessionCreate
from app.services import (
    activity_assignment_notification_service,
    customer_access_service,
    group_case_session_service,
)
from app.services.customer_service import list_all_customers
from app.utils.pagination import paginate
from app.utils.record_ownership import (
    ACTIVITY_CREATOR_ONLY_FIELDS,
    ensure_creator_for_changed_fields,
    ensure_record_creator,
    stamp_creator,
)

router = APIRouter(prefix="/api/group-case-sessions", tags=["group-case-sessions"])


def _fill_session_names(sessions: list, request: Request | None = None) -> list:
    """从客户信息实时填充 owner_name / host_name，并回填 space_name / room_name"""
    from app.services import space_service
    customers = list_all_customers()
    cmap = {c.id: c for c in customers}
    visible_ids = (
        customer_access_service.visible_customer_ids(request, customers)
        if request
        else set(cmap)
    )
    _space_map: dict[str, str] = {}
    _room_map: dict[str, str] = {}
    for sp in space_service.get_all_spaces():
        _space_map[sp.id] = sp.name
        for rm in sp.rooms:
            _room_map[rm.id] = rm.name

    def get_name(cid: str) -> str:
        if not cid:
            return ""
        c = cmap.get(cid)
        return c.nickname if c else ""

    for s in sessions:
        for field in ("owner_name", "host_name"):
            id_field = field.replace("_name", "_id")
            customer_id = getattr(s, id_field, "")
            actual = get_name(customer_id)
            if field == "owner_name" and customer_id not in visible_ids:
                actual = ""
            if getattr(s, field, "") != actual:
                setattr(s, field, actual)
        sid = getattr(s, "space_id", "")
        rid = getattr(s, "room_id", "")
        sn = _space_map.get(sid, "") if sid else ""
        rn = _room_map.get(rid, "") if rid else ""
        if getattr(s, "space_name", "") != sn:
            setattr(s, "space_name", sn)
        if getattr(s, "room_name", "") != rn:
            setattr(s, "room_name", rn)
    return sessions


@router.get("")
def list_sessions(
    date: Optional[str] = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
    request: Request = None,
):
    items = group_case_session_service.list_sessions(date)
    items = _fill_session_names(items, request)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_session(data: GroupCaseSessionCreate, request: Request, conversion: bool = False):
    customer_access_service.require_customer_scope(request, data.owner_id, action="设置为案主")
    customer_access_service.require_new_customer_ids(request, data.participant_ids, action="添加")
    try:
        session = group_case_session_service.create_session(
            stamp_creator(data, request), refresh_identities=not conversion
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    if not conversion:
        activity_assignment_notification_service.notify_new_assignments(
            "gcs",
            session,
            operator=operator,
        )
    return session


@router.patch("/{session_id}")
def update_session(session_id: str, data: dict, request: Request):
    old_session = group_case_session_service.get_session(session_id)
    if not old_session:
        raise HTTPException(status_code=404, detail="记录不存在")
    if data.get("owner_id") and data["owner_id"] != old_session.owner_id:
        customer_access_service.require_customer_scope(request, data["owner_id"], action="设置为案主")
    if "participant_ids" in data:
        customer_access_service.require_new_customer_ids(
            request,
            data.get("participant_ids") or [],
            existing_ids=old_session.participant_ids,
            action="添加",
        )
    ensure_creator_for_changed_fields(
        request, old_session, data, ACTIVITY_CREATOR_ONLY_FIELDS, "课表受保护信息", "activities"
    )
    old_member_ids = activity_assignment_notification_service.get_member_ids(old_session)
    try:
        session, warnings = group_case_session_service.update_session(session_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not session:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    activity_assignment_notification_service.notify_new_assignments(
        "gcs",
        session,
        previous_member_ids=old_member_ids,
        operator=operator,
    )
    result = session.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.delete("/{session_id}")
def delete_session(session_id: str, request: Request, conversion: bool = False):
    ensure_record_creator(
        request, group_case_session_service.get_session(session_id), "课表内容", "activities"
    )
    if not group_case_session_service.delete_session(session_id, refresh_identities=not conversion):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = "", date: str = "", request: Request = None):
    results = group_case_session_service.search_customers(q, date)
    if request is None:
        return results
    visible_ids = customer_access_service.visible_customer_ids(request, list_all_customers())
    return [result for result in results if result.get("id") in visible_ids]
