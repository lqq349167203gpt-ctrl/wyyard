from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.group_case_session import GroupCaseSessionCreate
from app.services import activity_assignment_notification_service, group_case_session_service
from app.services.customer_service import list_all_customers
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/group-case-sessions", tags=["group-case-sessions"])


def _fill_session_names(sessions: list) -> list:
    """从客户信息实时填充 owner_name / host_name，并回填 space_name / room_name"""
    from app.services import space_service
    customers = list_all_customers()
    cmap = {c.id: c for c in customers}
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
            actual = get_name(getattr(s, id_field, ""))
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
def list_sessions(date: Optional[str] = None, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = group_case_session_service.list_sessions(date)
    items = _fill_session_names(items)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_session(data: GroupCaseSessionCreate, request: Request, conversion: bool = False):
    try:
        session = group_case_session_service.create_session(data, refresh_identities=not conversion)
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
def delete_session(session_id: str, conversion: bool = False):
    if not group_case_session_service.delete_session(session_id, refresh_identities=not conversion):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = "", date: str = ""):
    return group_case_session_service.search_customers(q, date)
