"""课表与邀约记录的创建人归属校验。"""

from typing import Literal

from fastapi import HTTPException, Request

from app.services import position_edit_permission_service
from app.utils.request_roles import get_request_roles

EditArea = Literal["visits", "activities", "activity_teachers", "activity_participants"]

ACTIVITY_TEACHER_FIELDS = {
    "teacher_ids",
    "teacher_names",
    "host_id",
    "host_name",
    "achiever_id",
    "achiever_name",
}

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


def ensure_activity_update_access(request: Request, data: dict) -> None:
    """课表仅浏览时，独立放行已配置的人员与老师字段。"""
    roles = get_request_roles(request)
    if "超级管理员" in roles:
        return
    permissions = position_edit_permission_service.get_permissions(roles)
    if permissions["activities"] != "view":
        return
    allowed_fields: set[str] = set()
    if permissions["activity_participants"] != "view":
        allowed_fields.add("participant_ids")
    if permissions["activity_teachers"] != "view":
        allowed_fields.update(ACTIVITY_TEACHER_FIELDS)
    if set(data) - allowed_fields:
        raise HTTPException(status_code=403, detail="当前账号对课表内容仅有浏览权限")


def ensure_activity_teacher_access(request: Request, record, data: dict) -> None:
    """按独立权限校验课表老师字段的配置范围。"""
    teacher_fields = ACTIVITY_TEACHER_FIELDS.intersection(data)
    if not teacher_fields:
        return
    if record is not None and not any(
        data.get(field) != getattr(record, field, None)
        for field in teacher_fields
    ):
        return
    roles = get_request_roles(request)
    permissions = position_edit_permission_service.get_permissions(roles)
    scope = permissions["activity_teachers"]
    if "超级管理员" in roles or scope == "all":
        return
    if scope == "view":
        raise HTTPException(status_code=403, detail="当前账号没有配置课程老师的权限")
    if record is None:
        # “仅本人课表”允许在自己正在新建的课表中配置老师。
        return
    ensure_record_creator(request, record, "课程老师", "activity_teachers")


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
