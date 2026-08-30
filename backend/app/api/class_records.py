import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.base import StrictBaseModel
from app.services import (
    activity_assignment_notification_service,
    activity_withdrawal_service,
    class_record_service,
    customer_access_service,
)
from app.services.customer_service import get_customer, list_all_customers
from app.utils.pagination import paginate
from app.utils.record_ownership import (
    ACTIVITY_CREATOR_ONLY_FIELDS,
    ensure_creator_for_changed_fields,
    ensure_record_creator,
    stamp_creator,
)

router = APIRouter(prefix="/api/class-records", tags=["class-records"])


def _visible_customer_ids(request: Request | None) -> set[str] | None:
    if request is None:
        return None
    return customer_access_service.visible_customer_ids(request, list_all_customers())


def _fill_visit_nicknames(visits, visible_ids: set[str] | None = None):
    """为到访记录注入客户昵称"""
    result = []
    for v in visits:
        if visible_ids is not None and v.customer_id not in visible_ids:
            continue
        data = v.model_dump(mode="json")
        customer = get_customer(v.customer_id) if v.customer_id else None
        data["nickname"] = customer.nickname if customer else ""
        data["member_type"] = customer.member_type if customer else ""
        result.append(data)
    return result


def _fill_names(items: list, visible_ids: set[str] | None = None) -> list:
    """从客户信息实时填充 owner_name / host_name"""
    customers = list_all_customers()
    customer_map = {c.id: c for c in customers}

    def get_name(cid: str) -> str:
        if not cid:
            return ""
        c = customer_map.get(cid)
        return c.nickname if c else ""

    for item in items:
        data = item["data"]
        for field in ("owner_name", "host_name"):
            id_field = field.replace("_name", "_id")
            if id_field in data:
                customer_id = data.get(id_field, "")
                actual = get_name(customer_id)
                if field == "owner_name" and visible_ids is not None and customer_id not in visible_ids:
                    actual = ""
                if data.get(field) != actual:
                    data[field] = actual

    return items


@router.get("")
def list_records(date: Optional[str] = None, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = class_record_service.list_records(date)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.get("/unified")
def list_unified(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    type: str | None = Query(None),
    name: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    space_id: str | None = Query(None),
    teacher_id: str | None = Query(None),
    request: Request = None,
):
    from app.services import (
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
    )

    items = []
    # Class records
    for r in class_record_service.list_records(None, start_date, end_date):
        items.append({"type": "class", "data": r.model_dump(mode="json") if hasattr(r, "model_dump") else r, "date": r.get("date", "") if isinstance(r, dict) else getattr(r, "date", "")})

    # Group case sessions
    for s in group_case_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "gcs", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # Emotional release sessions
    for s in emotional_release_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "ers", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # Energy knot sessions
    for s in energy_knot_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "eks", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # Internal course sessions
    for s in internal_course_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "ics", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # 从客户数据实时填充名称
    items = _fill_names(items, _visible_customer_ids(request))

    # 回填 space_name / room_name（含已删除的空间/房间）
    from app.services import space_service
    _space_map: dict[str, str] = {}
    _room_map: dict[str, str] = {}
    for sp in space_service.get_all_spaces():
        _space_map[sp.id] = sp.name
        for rm in sp.rooms:
            _room_map[rm.id] = rm.name
    for item in items:
        d = item["data"]
        sid = d.get("space_id", "")
        rid = d.get("room_id", "")
        d["space_name"] = _space_map.get(sid, "") if sid else ""
        d["room_name"] = _room_map.get(rid, "") if rid else ""

    # Apply filters
    if type:
        items = [i for i in items if i["type"] == type]

    if name:
        name_lower = name.lower()
        filtered = []
        for i in items:
            title = ""
            if i["type"] == "class":
                title = i["data"].get("course_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "course_name", "")
            elif i["type"] == "gcs":
                owner = i["data"].get("owner_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "owner_name", "")
                title = f"觉醒游戏【{owner or '未分配'}】"
            elif i["type"] == "ers":
                owner = i["data"].get("owner_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "owner_name", "")
                title = f"情绪释放【{owner or '未分配'}】"
            elif i["type"] == "eks":
                owner = i["data"].get("owner_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "owner_name", "")
                desc = i["data"].get("description", "") if isinstance(i["data"], dict) else getattr(i["data"], "description", "")
                names = []
                try:
                    parsed = json.loads(desc) if desc else []
                    if isinstance(parsed, list):
                        names = [d.get("name", "") for d in parsed if d.get("name")]
                except Exception:
                    pass
                title = f"能量结【{'丨'.join(names)}】" if names else f"能量结【{owner or '未分配'}】"
            elif i["type"] == "ics":
                title = i["data"].get("course_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "course_name", "")
            if name_lower in title.lower():
                filtered.append(i)
        items = filtered

    if start_date:
        items = [i for i in items if i["date"] >= start_date]
    if end_date:
        items = [i for i in items if i["date"] <= end_date]
    if space_id:
        items = [i for i in items if (i["data"].get("space_id", "") if isinstance(i["data"], dict) else getattr(i["data"], "space_id", "")) == space_id]

    if teacher_id:
        filtered = []
        for i in items:
            d = i["data"]
            tids = d.get("teacher_ids", []) if isinstance(d, dict) else getattr(d, "teacher_ids", [])
            if teacher_id in tids:
                filtered.append(i)
        items = filtered

    # Sort by date desc, then start_time desc
    def sort_key(item):
        d = item["date"]
        st = item["data"].get("start_time", "") if isinstance(item["data"], dict) else getattr(item["data"], "start_time", "")
        return (d, st or "")
    items.sort(key=sort_key, reverse=True)

    return paginate(items, page, page_size)


@router.post("")
def create_record(data: dict, request: Request, conversion: bool = False):
    from app.models.class_record import ClassRecordCreate
    try:
        record = stamp_creator(ClassRecordCreate(**data), request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    customer_access_service.require_new_customer_ids(
        request,
        record.participant_ids,
        action="添加",
    )
    created = class_record_service.create_record(record, refresh_identities=not conversion)
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    if not conversion:
        activity_assignment_notification_service.notify_new_assignments(
            "class",
            created,
            operator=operator,
        )
    return created


@router.patch("/{record_id}")
def update_record(record_id: str, data: dict, request: Request, conversion: bool = False):
    old_record = class_record_service.get_record(record_id)
    if not old_record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if "participant_ids" in data:
        customer_access_service.require_new_customer_ids(
            request,
            data.get("participant_ids") or [],
            existing_ids=old_record.participant_ids,
            action="添加",
        )
    ensure_creator_for_changed_fields(
        request, old_record, data, ACTIVITY_CREATOR_ONLY_FIELDS, "课表受保护信息", "activities"
    )
    old_ids = set(old_record.participant_ids) if old_record else set()
    old_member_ids = activity_assignment_notification_service.get_member_ids(old_record)

    # 更新前记录课程名称/内容，用于检测变化
    old_course_name = old_record.course_name if old_record else ""
    old_activity_name = old_record.activity_name if old_record else ""
    old_description = old_record.course_description if old_record else ""

    try:
        record = class_record_service.update_record(
            record_id,
            data,
            refresh_identities=not conversion,
            sync_deductions=not conversion,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    # 检测课程名称/内容变化，通知所有已报名用户
    new_course_name = record.course_name or ""
    new_activity_name = record.activity_name or ""
    new_description = record.course_description or ""
    name_changed = (new_course_name != old_course_name or new_activity_name != old_activity_name)
    desc_changed = (new_description != old_description)
    if not conversion and (name_changed or desc_changed) and old_ids:
        operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
        display_name = record.activity_name or record.course_name
        activity_date = record.date

        # 收集变化说明
        changes = []
        if name_changed:
            old_display = old_activity_name or old_course_name
            new_display = new_activity_name or new_course_name
            if old_display != new_display:
                changes.append(f"活动名称已更新为「{new_display}」")
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

    # 如果 participant_ids 被修改，同步清理小程序报名记录 + 发送通知
    if not conversion and "participant_ids" in data:
        new_ids = set(record.participant_ids)
        removed_ids = old_ids - new_ids
        if removed_ids:
            from app.services.storage import delete_item, load_data
            signups_data = load_data("client_signups.json")
            deleted_ids = []
            for sid, s in signups_data.items():
                if isinstance(s, dict) and s.get("activity_id") == record_id and s.get("customer_id") in removed_ids:
                    deleted_ids.append(sid)
            for sid in deleted_ids:
                delete_item("client_signups.json", sid)

            operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
            activity_name = record.activity_name or record.course_name
            activity_date = record.date
            from app.services import client_notification_service
            for cid in removed_ids:
                client_notification_service.create_notification(
                    customer_id=cid,
                    type="signup_cancelled",
                    title="报名已取消",
                    content=f'您在"{activity_name}"（{activity_date}）的报名已被管理员取消',
                    activity_name=activity_name,
                    activity_date=activity_date,
                    operator=operator,
                )

    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    if not conversion:
        activity_assignment_notification_service.notify_new_assignments(
            "class",
            record,
            previous_member_ids=old_member_ids,
            operator=operator,
        )
    return record


class ParticipantUpdate(StrictBaseModel):
    participant_ids: List[str]


@router.patch("/{record_id}/participants")
def update_participants(record_id: str, data: ParticipantUpdate, request: Request):
    old_record = class_record_service.get_record(record_id)
    if not old_record:
        raise HTTPException(status_code=404, detail="记录不存在")
    old_ids = set(old_record.participant_ids) if old_record else set()
    customer_access_service.require_new_customer_ids(
        request,
        data.participant_ids,
        existing_ids=old_ids,
        action="添加",
    )
    old_member_ids = activity_assignment_notification_service.get_member_ids(old_record)

    try:
        record, warnings = class_record_service.update_participants(record_id, data.participant_ids)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not record:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")

    # 同步删除被移除人员的小程序报名记录 + 发送通知
    new_ids = set(data.participant_ids)
    removed_ids = old_ids - new_ids
    if removed_ids:
        from app.services.storage import delete_item, load_data
        signups_data = load_data("client_signups.json")
        deleted_ids = []
        for sid, s in signups_data.items():
            if isinstance(s, dict) and s.get("activity_id") == record_id and s.get("customer_id") in removed_ids:
                deleted_ids.append(sid)
        for sid in deleted_ids:
            delete_item("client_signups.json", sid)

        operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
        activity_name = record.activity_name or record.course_name
        activity_date = record.date
        from app.services import client_notification_service
        for cid in removed_ids:
            client_notification_service.create_notification(
                customer_id=cid,
                type="signup_cancelled",
                title="报名已取消",
                content=f'您在"{activity_name}"（{activity_date}）的报名已被管理员取消',
                activity_name=activity_name,
                activity_date=activity_date,
                operator=operator,
            )

    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    activity_assignment_notification_service.notify_new_assignments(
        "class",
        record,
        previous_member_ids=old_member_ids,
        operator=operator,
    )

    result = record.model_dump(mode="json")
    result["warnings"] = warnings
    return result


class CourseWithdrawalCreate(StrictBaseModel):
    customer_id: str


@router.post("/{record_id}/withdrawals")
def withdraw_participant(record_id: str, data: CourseWithdrawalCreate, request: Request):
    record = class_record_service.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="课程记录不存在")
    ensure_record_creator(request, record, "课程", "activities")
    customer_access_service.require_new_customer_ids(
        request,
        [data.customer_id],
        action="办理退课",
    )
    customer = get_customer(data.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    before_data = record.model_dump(mode="json")
    operator_id = getattr(request.state, "user_id", "") or ""
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    try:
        updated, changed = class_record_service.withdraw_participant(
            record_id,
            data.customer_id,
            operator_id,
            operator,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not updated:
        raise HTTPException(status_code=404, detail="课程记录不存在")
    activity_name = updated.activity_name or updated.course_name or "未命名课程"
    customer_name = customer.nickname or customer.name or "未命名客户"

    # 同步客户端小程序报名状态。参与人历史保留在课表中，但客户端不再显示为已报名。
    from app.services.storage import delete_item, load_data, save_item
    signups_data = load_data("client_signups.json")
    for signup_id, signup in signups_data.items():
        if isinstance(signup, dict):
            if signup.get("activity_id") == record_id and signup.get("customer_id") == data.customer_id:
                delete_item("client_signups.json", signup_id)
        elif isinstance(signup, list):
            retained = [
                item
                for item in signup
                if not (
                    isinstance(item, dict)
                    and item.get("activity_id") == record_id
                    and item.get("customer_id") == data.customer_id
                )
            ]
            if len(retained) != len(signup):
                save_item("client_signups.json", signup_id, retained)

    if changed:
        from app.services import client_notification_service
        client_notification_service.create_notification(
            customer_id=data.customer_id,
            type="signup_cancelled",
            title="退课已办理",
            content=f'您在"{activity_name}"（{updated.date}）的退课已办理',
            activity_name=activity_name,
            activity_date=updated.date,
            operator=operator,
        )

    request.state.operation_log_context = {
        "content": f"退课：{customer_name} · {activity_name}（{updated.date}）",
        "entity_id": record_id,
        "before_data": before_data,
        "after_data": updated.model_dump(mode="json"),
    }
    return updated


@router.get("/withdrawals")
def list_withdrawals(
    request: Request,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
    nickname: str | None = None,
    status: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
):
    items = activity_withdrawal_service.list_withdrawals()
    visible_ids = _visible_customer_ids(request)
    filtered = []
    for item in items:
        if visible_ids is not None and item["customer_id"] not in visible_ids:
            continue
        customer = get_customer(item["customer_id"]) if item["customer_id"] else None
        item["nickname"] = (
            (customer.nickname or customer.name)
            if customer
            else item.get("customer_name") or "已删除客户"
        )
        if nickname and nickname.strip() not in item["nickname"]:
            continue
        if status and status != "all" and item["status"] != status:
            continue
        if start_date and item["course_date"] < start_date:
            continue
        if end_date and item["course_date"] > end_date:
            continue
        filtered.append(item)
    if page is not None:
        return paginate(filtered, page, page_size or 20)
    return filtered


@router.delete("/{record_id}/withdrawals/{customer_id}")
def cancel_withdrawal(record_id: str, customer_id: str, request: Request):
    record = class_record_service.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="课程记录不存在")
    ensure_record_creator(request, record, "课程", "activities")
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    customer_access_service.require_new_customer_ids(
        request,
        [customer_id],
        action="恢复退课",
    )
    before_data = record.model_dump(mode="json")
    operator_id = getattr(request.state, "user_id", "") or ""
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    try:
        updated, changed = class_record_service.cancel_withdrawal(
            record_id,
            customer_id,
            operator_id,
            operator,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not updated:
        raise HTTPException(status_code=404, detail="课程记录不存在")
    if not changed:
        raise HTTPException(status_code=404, detail="该客户未办理退课")
    activity_name = updated.activity_name or updated.course_name or "未命名课程"
    customer_name = customer.nickname or customer.name or "未命名客户"
    request.state.operation_log_context = {
        "content": f"恢复退课：{customer_name} · {activity_name}（{updated.date}）",
        "entity_id": record_id,
        "before_data": before_data,
        "after_data": updated.model_dump(mode="json"),
    }
    return updated


@router.patch("/{record_id}/groups")
def update_groups(record_id: str, data: dict, request: Request):
    old_record = class_record_service.get_record(record_id)
    if not old_record:
        raise HTTPException(status_code=404, detail="记录不存在")
    old_ids = set(old_record.participant_ids) if old_record else set()
    old_member_ids = activity_assignment_notification_service.get_member_ids(old_record)

    groups = data.get("groups", [])
    submitted_group_ids = {
        customer_id
        for group in groups
        for customer_id in (
            [group.get("leader_id", ""), group.get("deputy_id", "")]
            + list(group.get("member_ids", []) or [])
        )
        if customer_id
    }
    existing_group_ids = {
        customer_id
        for group in (old_record.groups or [])
        for customer_id in (
            [group.leader_id, group.deputy_id]
            + list(group.member_ids or [])
        )
        if customer_id
    }
    customer_access_service.require_new_customer_ids(
        request,
        submitted_group_ids,
        existing_ids=existing_group_ids,
        action="添加",
    )
    try:
        record, warnings = class_record_service.update_groups(record_id, groups)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not record:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")

    # 同步删除被移除人员的小程序报名记录 + 发送通知
    new_ids = set(record.participant_ids)
    removed_ids = old_ids - new_ids
    if removed_ids:
        from app.services.storage import delete_item, load_data
        signups_data = load_data("client_signups.json")
        deleted_ids = []
        for sid, s in signups_data.items():
            if isinstance(s, dict) and s.get("activity_id") == record_id and s.get("customer_id") in removed_ids:
                deleted_ids.append(sid)
        for sid in deleted_ids:
            delete_item("client_signups.json", sid)

        operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
        activity_name = record.activity_name or record.course_name
        activity_date = record.date
        from app.services import client_notification_service
        for cid in removed_ids:
            client_notification_service.create_notification(
                customer_id=cid,
                type="signup_cancelled",
                title="报名已取消",
                content=f'您在"{activity_name}"（{activity_date}）的报名已被管理员取消',
                activity_name=activity_name,
                activity_date=activity_date,
                operator=operator,
            )

    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    activity_assignment_notification_service.notify_new_assignments(
        "class",
        record,
        previous_member_ids=old_member_ids,
        operator=operator,
    )

    result = record.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.delete("/{record_id}")
def delete_record(record_id: str, request: Request, conversion: bool = False):
    old_record = class_record_service.get_record(record_id)
    ensure_record_creator(request, old_record, "课表内容", "activities")

    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    activity_name = old_record.activity_name or old_record.course_name
    activity_date = old_record.date
    participant_ids = list(old_record.participant_ids)

    if not class_record_service.delete_record(record_id, refresh_identities=not conversion):
        raise HTTPException(status_code=404, detail="记录不存在")

    # 清理该活动的小程序报名记录 + 通知所有参与者
    from app.services.storage import delete_item, load_data
    signups_data = load_data("client_signups.json")
    signup_customer_ids = set()
    deleted_ids = []
    for sid, s in signups_data.items():
        if isinstance(s, dict) and s.get("activity_id") == record_id:
            signup_customer_ids.add(s.get("customer_id", ""))
            deleted_ids.append(sid)
    for sid in deleted_ids:
        delete_item("client_signups.json", sid)

    all_notified = set(participant_ids) | signup_customer_ids
    if all_notified and not conversion:
        from app.services import client_notification_service
        for cid in all_notified:
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


@router.get("/calendar-counts")
def calendar_counts():
    """返回各日期的活动场数统计 {date: count}，只计数不序列化"""
    from collections import defaultdict

    from app.services import (
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
    )
    counts: dict[str, int] = defaultdict(int)

    for r in class_record_service.list_records():
        if r.date:
            counts[r.date] += 1
    for s in group_case_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1
    for s in emotional_release_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1
    for s in energy_knot_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1
    for s in internal_course_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1

    return dict(counts)


@router.get("/dashboard")
def dashboard(
    date: str = Query(...),
    space_id: str = Query(""),
    request: Request = None,
):
    """单次请求返回当天全部数据，替代 8 个独立 API 调用"""
    from datetime import datetime, timedelta

    from app.services import (
        daily_grouping_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
        visit_service,
    )

    # 计算日期范围（21 天窗口，与前端一致）
    d = datetime.strptime(date, "%Y-%m-%d")
    start_date = (d - timedelta(days=7)).strftime("%Y-%m-%d")
    end_date = (d + timedelta(days=13)).strftime("%Y-%m-%d")

    # 构建 room_id → room_name / space_id → space_name 映射（含已删除）
    from app.services import space_service
    room_map: dict[str, str] = {}
    space_map: dict[str, str] = {}
    for sp in space_service.get_all_spaces():
        space_map[sp.id] = sp.name
        for rm in sp.rooms:
            room_map[rm.id] = rm.name

    def _fill_room_name(records):
        """根据 space_id / room_id 始终同步 space_name / room_name"""
        for r in records:
            sid = getattr(r, "space_id", "")
            rid = getattr(r, "room_id", "")
            r.space_name = space_map.get(sid, "") if sid else ""
            r.room_name = room_map.get(rid, "") if rid else ""

    # 日历计数：按空间筛选
    from collections import defaultdict
    cal_counts: dict[str, int] = defaultdict(int)
    def _match_space(record) -> bool:
        return not space_id or getattr(record, "space_id", "") == space_id
    for r in class_record_service.list_records():
        if r.date and _match_space(r):
            cal_counts[r.date] += 1
    for s in group_case_session_service.list_sessions():
        if s.date and _match_space(s):
            cal_counts[s.date] += 1
    for s in emotional_release_session_service.list_sessions():
        if s.date and _match_space(s):
            cal_counts[s.date] += 1
    for s in energy_knot_session_service.list_sessions():
        if s.date and _match_space(s):
            cal_counts[s.date] += 1
    for s in internal_course_session_service.list_sessions():
        if s.date and _match_space(s):
            cal_counts[s.date] += 1
    records_cr = class_record_service.list_records(date)
    records_gcs = group_case_session_service.list_sessions(date)
    records_ers = emotional_release_session_service.list_sessions(date)
    records_eks = energy_knot_session_service.list_sessions(date)
    records_ics = internal_course_session_service.list_sessions(date)
    if space_id:
        records_cr = [r for r in records_cr if _match_space(r)]
        records_gcs = [r for r in records_gcs if _match_space(r)]
        records_ers = [r for r in records_ers if _match_space(r)]
        records_eks = [r for r in records_eks if _match_space(r)]
        records_ics = [r for r in records_ics if _match_space(r)]
    for lst in (records_cr, records_gcs, records_ers, records_eks, records_ics):
        _fill_room_name(lst)

    # 填充 host_name / achiever_name / teacher_names
    customers = list_all_customers()
    customer_map = {c.id: c.nickname for c in customers}
    visible_ids = _visible_customer_ids(request)
    if visible_ids is None:
        visible_ids = set(customer_map)
    for s in records_gcs + records_ers:
        s.owner_name = customer_map.get(s.owner_id, "") if s.owner_id in visible_ids else ""
        if s.host_id and not s.host_name:
            s.host_name = customer_map.get(s.host_id, "")
        if s.achiever_id and not s.achiever_name:
            s.achiever_name = customer_map.get(s.achiever_id, "")
    for s in records_eks + records_ics:
        if s.host_id and not s.host_name:
            s.host_name = customer_map.get(s.host_id, "")

    # 通过 dict 注入 teacher_names（Pydantic 模型无此字段）
    gcs_dicts = [s.model_dump(mode="json") for s in records_gcs]
    ers_dicts = [s.model_dump(mode="json") for s in records_ers]
    eks_dicts = [s.model_dump(mode="json") for s in records_eks]
    ics_dicts = [s.model_dump(mode="json") for s in records_ics]
    cr_dicts = [r.model_dump(mode="json") for r in records_cr]
    for d in gcs_dicts + ers_dicts + eks_dicts + ics_dicts + cr_dicts:
        ids = d.get("teacher_ids", []) or []
        d["teacher_names"] = [customer_map.get(tid, "") for tid in ids if customer_map.get(tid)]
        participant_ids = list(d.get("participant_ids", []) or [])
        for group in d.get("groups", []) or []:
            participant_ids.extend(
                value
                for value in (
                    group.get("leader_id", ""),
                    group.get("deputy_id", ""),
                )
                if value
            )
            participant_ids.extend(group.get("member_ids", []) or [])
        visible_participant_ids = list(
            dict.fromkeys(
                participant_id
                for participant_id in participant_ids
                if participant_id in visible_ids and participant_id not in ids
            )
        )
        withdrawn_participant_ids = set(d.get("withdrawn_participant_ids", []) or [])
        d["participants"] = [
            {
                "id": participant_id,
                "nickname": customer_map.get(participant_id, ""),
                "withdrawn": participant_id in withdrawn_participant_ids,
            }
            for participant_id in visible_participant_ids
            if customer_map.get(participant_id)
        ]
        active_participant_ids = [
            participant_id
            for participant_id in visible_participant_ids
            if participant_id not in withdrawn_participant_ids
        ]
        d["participant_names"] = [
            customer_map.get(pid, "")
            for pid in active_participant_ids
            if customer_map.get(pid)
        ]
        d["visible_participant_count"] = len(active_participant_ids)
        owner_id = d.get("owner_id", "")
        if owner_id and owner_id not in visible_ids:
            d["owner_name"] = ""

    visible_visit_ids = list(visible_ids)
    visit_counts = (
        visit_service.get_date_counts(
            visible_visit_ids,
            start_date=start_date,
            end_date=end_date,
            space_id=space_id if space_id else None,
        )
        if visible_visit_ids
        else {}
    )

    return {
        "class_records": cr_dicts,
        "gcs_sessions": gcs_dicts,
        "ers_sessions": ers_dicts,
        "eks_sessions": eks_dicts,
        "ics_sessions": ics_dicts,
        "visits": _fill_visit_nicknames(
            visit_service.list_visits(date, space_id=space_id if space_id else None),
            visible_ids,
        ),
        "visit_counts": visit_counts,
        "calendar_counts": dict(cal_counts),
        "groupings": daily_grouping_service.get_grouping(date) or {"date": date, "groups": []},
    }


@router.get("/search-customers")
def search_customers(q: str = "", request: Request = None):
    results = class_record_service.search_customers(q)
    visible_ids = _visible_customer_ids(request)
    if visible_ids is None:
        return results
    return [result for result in results if result.get("id") in visible_ids]
