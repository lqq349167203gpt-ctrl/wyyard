from fastapi import APIRouter, HTTPException, Request

from app.models.customer_tag import CustomerTagAssignmentUpdate, CustomerTagCreate, CustomerTagUpdate
from app.services import customer_service, customer_tag_service, position_permission_service

router = APIRouter(prefix="/api/customer-tags", tags=["customer-tags"])


def _scope_label(scope: str) -> str:
    return "团队共享" if scope == "public" else "仅自己可见"


def _tag_snapshot(tag: dict) -> dict:
    """仅保留操作日志中需要展示的标签字段。"""
    return {
        "name": tag.get("name", ""),
        "scope": tag.get("scope", "private"),
        "description": tag.get("description", ""),
        "enabled": tag.get("enabled", True),
    }


def _tag_model_snapshot(tag) -> dict:
    return _tag_snapshot(tag.model_dump(mode="json"))


def _assignment_snapshot(customer_name: str, tags: list[dict]) -> dict:
    return {
        "customer_name": customer_name,
        "customer_tags": [tag.get("name", "") for tag in tags if tag.get("name")],
    }


def _set_operation_log_context(
    request: Request,
    *,
    entity_id: str,
    content: str,
    before_data: dict | None,
    after_data: dict | None,
) -> None:
    """把接口内已确认的业务快照交给统一操作日志中间件。"""
    request.state.operation_log_context = {
        "entity_id": entity_id,
        "content": content,
        "before_data": before_data,
        "after_data": after_data,
    }


def _build_tag_update_content(before: dict, after: dict) -> str:
    changes: list[str] = []
    if before.get("name") != after.get("name"):
        changes.append(f"名称“{before.get('name', '')}”改为“{after.get('name', '')}”")
    if before.get("description", "") != after.get("description", ""):
        old_description = before.get("description") or "无"
        new_description = after.get("description") or "无"
        changes.append(f"说明“{old_description}”改为“{new_description}”")
    if before.get("enabled", True) != after.get("enabled", True):
        changes.append("状态改为启用" if after.get("enabled") else "状态改为停用")
    detail = "；".join(changes) if changes else "内容无变更"
    return f"编辑客户标签“{after.get('name') or before.get('name', '')}”：{detail}"


def _actor(request: Request) -> tuple[str, str, str, set[str]]:
    actor_id = getattr(request.state, "user_id", "")
    actor_name = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    role = getattr(request.state, "user_role", "")
    permissions = set(position_permission_service.get_permissions(role))
    return actor_id, actor_name, role, permissions


def _require_tag_access(request: Request) -> tuple[str, str, str, set[str]]:
    actor = _actor(request)
    if actor[2] != "超级管理员" and not ({"customer-tags", "healing-records", "referral-statistics"} & actor[3]):
        raise HTTPException(status_code=403, detail="权限不足")
    return actor


def _can_manage_public(role: str, permissions: set[str]) -> bool:
    return role == "超级管理员" or "customer-tags" in permissions


@router.get("")
def list_tags(request: Request, include_disabled: bool = False):
    actor_id, _, _, _ = _require_tag_access(request)
    return customer_tag_service.list_visible_tags(actor_id, include_disabled=include_disabled)


@router.post("")
def create_tag(data: CustomerTagCreate, request: Request):
    actor_id, actor_name, role, permissions = _require_tag_access(request)
    if data.scope == "public" and not _can_manage_public(role, permissions):
        raise HTTPException(status_code=403, detail="无权创建公共标签")
    try:
        tag = customer_tag_service.create_tag(data, actor_id, actor_name)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    description = f"，说明：{tag['description']}" if tag.get("description") else ""
    _set_operation_log_context(
        request,
        entity_id=tag["id"],
        content=f"新建客户标签“{tag['name']}”（{_scope_label(tag['scope'])}{description}）",
        before_data=None,
        after_data=_tag_snapshot(tag),
    )
    return tag


@router.put("/{tag_id}")
def update_tag(tag_id: str, data: CustomerTagUpdate, request: Request):
    actor_id, _, role, permissions = _require_tag_access(request)
    before_tag = customer_tag_service.get_tag(tag_id)
    before_snapshot = _tag_model_snapshot(before_tag) if before_tag else None
    try:
        tag = customer_tag_service.update_tag(
            tag_id,
            data,
            actor_id,
            _can_manage_public(role, permissions),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    after_snapshot = _tag_snapshot(tag)
    _set_operation_log_context(
        request,
        entity_id=tag_id,
        content=_build_tag_update_content(before_snapshot or {}, after_snapshot),
        before_data=before_snapshot,
        after_data=after_snapshot,
    )
    return tag


@router.delete("/{tag_id}")
def delete_tag(tag_id: str, request: Request):
    actor_id, _, role, permissions = _require_tag_access(request)
    before_tag = customer_tag_service.get_tag(tag_id)
    try:
        deleted = customer_tag_service.archive_tag(
            tag_id,
            actor_id,
            _can_manage_public(role, permissions),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="标签不存在")
    if before_tag:
        before_snapshot = _tag_model_snapshot(before_tag)
        after_snapshot = {**before_snapshot, "enabled": False}
        _set_operation_log_context(
            request,
            entity_id=tag_id,
            content=f"停用客户标签“{before_tag.name}”（{_scope_label(before_tag.scope)}）",
            before_data=before_snapshot,
            after_data=after_snapshot,
        )
    return {"message": "标签已停用"}


@router.get("/customers/{customer_id}")
def list_customer_tags(customer_id: str, request: Request):
    actor_id, _, _, _ = _require_tag_access(request)
    if not customer_service.get_customer(customer_id):
        raise HTTPException(status_code=404, detail="客户不存在")
    return customer_tag_service.list_customer_tags(customer_id, actor_id)


@router.put("/customers/{customer_id}")
def set_customer_tags(customer_id: str, data: CustomerTagAssignmentUpdate, request: Request):
    actor_id, actor_name, role, permissions = _require_tag_access(request)
    if role != "超级管理员" and "healing-records" not in permissions:
        raise HTTPException(status_code=403, detail="无权编辑客户标签")
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    before_tags = customer_tag_service.list_customer_tags(customer_id, actor_id)
    try:
        after_tags = customer_tag_service.set_customer_tags(customer_id, data.tag_ids, actor_id, actor_name)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    customer_name = customer.nickname or customer.name or customer_id[:8]
    before_names = {tag["name"] for tag in before_tags}
    after_names = {tag["name"] for tag in after_tags}
    added_names = sorted(after_names - before_names)
    removed_names = sorted(before_names - after_names)
    changes: list[str] = []
    if added_names:
        changes.append(f"添加标签“{'、'.join(added_names)}”")
    if removed_names:
        changes.append(f"移除标签“{'、'.join(removed_names)}”")
    if not changes:
        # 保存客户资料时前端会一并提交标签；标签未变化不属于有效业务操作。
        request.state.skip_operation_log = True
        return after_tags
    _set_operation_log_context(
        request,
        entity_id=customer_id,
        content=f"客户“{customer_name}”：{'；'.join(changes)}",
        before_data=_assignment_snapshot(customer_name, before_tags),
        after_data=_assignment_snapshot(customer_name, after_tags),
    )
    return after_tags
