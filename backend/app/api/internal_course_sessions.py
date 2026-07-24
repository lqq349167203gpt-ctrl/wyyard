from fastapi import APIRouter, HTTPException, Query, Request
from app.utils.pagination import paginate
from app.services import internal_course_session_service
from app.models.internal_course_session import InternalCourseSessionCreate

router = APIRouter(prefix="/api/internal-course-sessions", tags=["internal-course-sessions"])


def _fill_ics_names(sessions: list) -> list:
    from app.services import space_service
    _space_map: dict[str, str] = {}
    _room_map: dict[str, str] = {}
    for sp in space_service.get_all_spaces():
        _space_map[sp.id] = sp.name
        for rm in sp.rooms:
            _room_map[rm.id] = rm.name

    for s in sessions:
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
def list_sessions(date: str = "", page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = internal_course_session_service.list_sessions(date or None)
    items = _fill_ics_names(items)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_session(data: InternalCourseSessionCreate):
    return internal_course_session_service.create_session(data)


@router.patch("/{session_id}")
def update_session(session_id: str, data: dict, request: Request):
    old_session = internal_course_session_service.get_session(session_id)
    old_ids = set(old_session.participant_ids) if old_session else set()

    old_course_name = old_session.course_name if old_session else ""
    old_description = old_session.course_description if old_session else ""

    try:
        session = internal_course_session_service.update_session(session_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not session:
        raise HTTPException(status_code=404, detail="记录不存在")

    # 检测课程名称/内容变化，通知所有已报名用户
    new_course_name = session.course_name or ""
    new_description = session.course_description or ""
    name_changed = (new_course_name != old_course_name)
    desc_changed = (new_description != old_description)
    if (name_changed or desc_changed) and old_ids:
        operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
        display_name = session.course_name
        activity_date = session.date

        changes = []
        if name_changed:
            changes.append(f"活动名称已更新为「{new_course_name}」")
        if desc_changed:
            changes.append("活动内容已更新")
        change_text = "，".join(changes)

        from app.services import client_notification_service
        for cid in old_ids:
            client_notification_service.create_notification(
                customer_id=cid,
                type="activity_changed",
                title="活动信息已更新",
                content=f'您报名的"{display_name}"（{activity_date}）{change_text}，请留意最新信息',
                activity_name=display_name,
                activity_date=activity_date,
                operator=operator,
            )

    return session


@router.delete("/{session_id}")
def delete_session(session_id: str, request: Request):
    old_session = internal_course_session_service.get_session(session_id)
    if not old_session:
        raise HTTPException(status_code=404, detail="记录不存在")

    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    activity_name = old_session.course_name
    activity_date = old_session.date
    participant_ids = list(old_session.participant_ids)

    if not internal_course_session_service.delete_session(session_id):
        raise HTTPException(status_code=404, detail="记录不存在")

    if participant_ids:
        from app.services import client_notification_service
        for cid in participant_ids:
            client_notification_service.create_notification(
                customer_id=cid,
                type="activity_cancelled",
                title="活动已取消",
                content=f'您报名的"{activity_name}"（{activity_date}）已被取消',
                activity_name=activity_name,
                activity_date=activity_date,
                operator=operator,
            )

    return {"message": "删除成功"}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return internal_course_session_service.search_customers(q)
