"""课表与邀约记录的创建人归属校验。"""

from typing import Literal

from fastapi import HTTPException, Request

from app.services import customer_service, position_edit_permission_service
from app.utils.request_roles import get_request_roles

EditArea = Literal["visits", "activities", "activity_participants"]

ACTIVITY_CREATOR_ONLY_FIELDS = {
    "course_id",
    "course_name",
    "course_type",
    "activity_name",
    "name",
    "activity_mode",
    "start_time",
    "end_time",
    "is_public_welfare",
    "membership_deduction_count",
    "teacher_ids",
    "host_id",
    "host_name",
    "achiever_id",
    "achiever_name",
    "owner_id",
    "owner_name",
    "description",
    "course_description",
    "course_review",
}


def get_request_actor(request: Request) -> tuple[str, str]:
    """返回当前账号的稳定 ID 与页面显示名称。"""
    actor_id = str(getattr(request.state, "user_id", "") or "")
    actor_name = str(
        getattr(request.state, "user_owner", "")
        or getattr(request.state, "user_name", "")
        or ""
    )
    return actor_id, actor_name


def _normalized_name(value: object) -> str:
    return str(value or "").strip().casefold()


def _record_teacher_ids(record) -> set[str]:
    teacher_ids = {
        str(customer_id)
        for customer_id in (getattr(record, "teacher_ids", None) or [])
        if customer_id
    }
    for field in ("host_id", "achiever_id"):
        customer_id = str(getattr(record, field, "") or "")
        if customer_id:
            teacher_ids.add(customer_id)
    return teacher_ids


def is_request_activity_teacher(request: Request, record) -> bool:
    """当前账号归属人是否为该堂课已配置的老师。"""
    if record is None:
        return False
    _, actor_name = get_request_actor(request)
    normalized_actor = _normalized_name(actor_name)
    if not normalized_actor:
        return False

    actor_customer_ids = {
        customer.id
        for customer in customer_service.list_all_customers()
        if normalized_actor in {
            _normalized_name(customer.nickname),
            _normalized_name(customer.name),
        }
    }
    if actor_customer_ids.intersection(_record_teacher_ids(record)):
        return True

    # 兼容极少数只保留老师姓名、尚未保存 teacher_ids 的旧记录。
    teacher_names = {
        _normalized_name(name)
        for name in (getattr(record, "teacher_names", None) or [])
        if name
    }
    teacher_names.update(
        _normalized_name(getattr(record, field, ""))
        for field in ("host_name", "achiever_name")
    )
    return normalized_actor in teacher_names


def can_request_edit_activity_content(request: Request, record) -> bool:
    """课表内容可由全部权限、创建人或已配置的授课老师修改。"""
    roles = get_request_roles(request)
    permissions = position_edit_permission_service.get_permissions(roles)
    if "超级管理员" in roles or permissions["activities"] == "all":
        return True

    if permissions["activities"] != "view":
        actor_id, actor_name = get_request_actor(request)
        created_by_id = str(getattr(record, "created_by_id", "") or "")
        created_by = str(getattr(record, "created_by", "") or "")
        is_creator = (
            bool(actor_id and actor_id == created_by_id)
            if created_by_id
            else bool(actor_name and created_by and actor_name == created_by)
        )
        if is_creator:
            return True

    return (
        permissions["activity_teachers"] != "view"
        and is_request_activity_teacher(request, record)
    )


def stamp_creator(data, request: Request):
    """由服务端写入创建人，禁止信任客户端传入值。"""
    actor_id, actor_name = get_request_actor(request)
    return data.model_copy(
        update={"created_by_id": actor_id, "created_by": actor_name}
    )


def ensure_record_creator(
    request: Request,
    record,
    label: str,
    edit_area: EditArea,
) -> None:
    """仅允许记录创建人修改；无历史归属的旧记录保持只读。"""
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")

    roles = get_request_roles(request)
    if position_edit_permission_service.has_all_edit(roles, edit_area):
        return

    actor_id, actor_name = get_request_actor(request)
    created_by_id = str(getattr(record, "created_by_id", "") or "")
    created_by = str(getattr(record, "created_by", "") or "")

    if created_by_id:
        allowed = bool(actor_id and actor_id == created_by_id)
    else:
        allowed = bool(created_by and actor_name and created_by == actor_name)

    if not allowed:
        raise HTTPException(status_code=403, detail=f"只能修改自己创建的{label}")


def ensure_creator_for_changed_fields(
    request: Request,
    record,
    data: dict,
    protected_fields: set[str],
    label: str,
    edit_area: EditArea,
) -> None:
    """仅当受保护字段的值确实发生变化时，要求当前账号是创建人。"""
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")

    changed_protected_fields = {
        field
        for field in protected_fields.intersection(data)
        if data.get(field) != getattr(record, field, None)
    }
    if changed_protected_fields:
        if edit_area == "activities" and can_request_edit_activity_content(request, record):
            return
        ensure_record_creator(request, record, label, edit_area)


def ensure_activity_participant_access(request: Request, record=None) -> None:
    """校验课表老人/新人参与名单的配置范围。新建课表时“仅本人”视为本人记录。"""
    roles = get_request_roles(request)
    scope = position_edit_permission_service.get_permissions(roles)["activity_participants"]
    if "超级管理员" in roles or scope == "all":
        return
    if scope == "view":
        raise HTTPException(status_code=403, detail="当前账号没有配置课表参与人的权限")
    if record is not None:
        ensure_record_creator(request, record, "课表参与人", "activity_participants")


def ensure_activity_update_access(request: Request, record, data: dict) -> None:
    """课表仅浏览时，只放行授课老师的课程内容或独立获权的参与人字段。"""
    roles = get_request_roles(request)
    if "超级管理员" in roles:
        return
    permissions = position_edit_permission_service.get_permissions(roles)
    if can_request_edit_activity_content(request, record):
        return
    if permissions["activities"] != "view":
        return
    allowed_fields: set[str] = set()
    if permissions["activity_participants"] != "view":
        allowed_fields.add("participant_ids")
    if set(data) - allowed_fields:
        raise HTTPException(status_code=403, detail="只能修改自己录入或本人授课的课表内容")


def stamp_payment_creator(data, request: Request):
    """付费项目创建人始终由服务端按当前账号写入。"""
    actor_id, actor_name = get_request_actor(request)
    return data.model_copy(update={"created_by_id": actor_id, "created_by": actor_name})


def ensure_payment_record_manager(request: Request, record) -> None:
    """按角色配置限制付费记录的修改与删除范围。"""
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    roles = get_request_roles(request)
    scope = position_edit_permission_service.get_permissions(roles)["payments"]
    if "超级管理员" in roles or scope == "all":
        return
    actor_id, actor_name = get_request_actor(request)
    created_by_id = str(getattr(record, "created_by_id", "") or "")
    created_by = str(getattr(record, "created_by", "") or "")
    allowed = bool(actor_id and actor_id == created_by_id) if created_by_id else bool(
        actor_name and created_by and actor_name == created_by
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="只能修改或删除自己创建的付费记录")
