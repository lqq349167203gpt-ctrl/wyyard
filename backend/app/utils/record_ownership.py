"""课表与邀约记录的创建人归属校验。"""

from typing import Literal

from fastapi import HTTPException, Request

from app.services import position_edit_permission_service

EditArea = Literal["visits", "activities"]

ACTIVITY_CREATOR_ONLY_FIELDS = {
    "course_id",
    "course_name",
    "course_type",
    "activity_name",
    "name",
    "teacher_ids",
    "teacher_names",
    "host_id",
    "host_name",
    "achiever_id",
    "achiever_name",
    "activity_mode",
    "start_time",
    "end_time",
    "is_public_welfare",
    "membership_deduction_count",
    "owner_id",
    "owner_name",
    "description",
    "course_description",
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

    role = str(getattr(request.state, "user_role", "") or "")
    if position_edit_permission_service.has_all_edit(role, edit_area):
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
