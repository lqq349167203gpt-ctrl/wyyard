from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.base import StrictBaseModel
from app.services import activity_theme_service, position_edit_permission_service
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/activity-themes", tags=["activity-themes"])


class SaveThemeRequest(StrictBaseModel):
    date: str
    space_id: str = ""
    week_theme: str = ""
    week_theme_detail: str = ""
    day_theme: str = ""
    day_theme_detail: str = ""


class BatchSaveThemeRequest(StrictBaseModel):
    themes: List[SaveThemeRequest]


class ScheduleLockRequest(StrictBaseModel):
    date: str
    space_id: str = ""


def _can_manage_lock(request: Request) -> bool:
    roles = get_request_roles(request)
    return "超级管理员" in roles or position_edit_permission_service.get_permissions(roles)["activity_lock"]


def _require_lock_permission(request: Request) -> None:
    if not _can_manage_lock(request):
        raise HTTPException(status_code=403, detail="当前账号没有课表核对与锁定权限")


def _lock_response(theme, request: Request):
    result = theme.model_dump(mode="json") if theme else {}
    result["can_manage"] = _can_manage_lock(request)
    return result


@router.get("")
async def list_themes(
    request: Request,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    space_ids: Optional[List[str]] = Query(None),
):
    themes = activity_theme_service.list_themes(start_date, end_date, space_ids)
    role = getattr(request.state, "user_role", "") or ""
    if role and role != "customer":
        return themes
    # 主题本身是公开展示数据；核对人属于内部员工信息，不对客户端或匿名请求返回。
    result = []
    for theme in themes:
        item = theme.model_dump(mode="json")
        item["locked_by_id"] = ""
        item["locked_by"] = ""
        result.append(item)
    return result


@router.get("/lock-status")
async def get_lock_status(date: str, space_id: str = "", request: Request = None):
    theme = activity_theme_service.get_theme_for_scope(date, space_id)
    if theme is None:
        return {
            "date": date,
            "space_id": space_id,
            "is_locked": False,
            "locked_by_id": "",
            "locked_by": "",
            "locked_at": None,
            "can_manage": _can_manage_lock(request),
        }
    return _lock_response(theme, request)


@router.post("/lock")
async def lock_schedule(data: ScheduleLockRequest, request: Request):
    _require_lock_permission(request)
    previous = activity_theme_service.get_theme_for_scope(data.date, data.space_id)
    before_data = previous.model_dump(mode="json") if previous else None
    operator_id = getattr(request.state, "user_id", "") or ""
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    theme = activity_theme_service.set_lock(
        data.date,
        data.space_id,
        locked=True,
        operator_id=operator_id,
        operator=operator,
    )
    request.state.operation_log_context = {
        "content": f"核对并锁定课表：{data.date}",
        "entity_id": theme.id,
        "before_data": before_data,
        "after_data": theme.model_dump(mode="json"),
    }
    return _lock_response(theme, request)


@router.post("/unlock")
async def unlock_schedule(data: ScheduleLockRequest, request: Request):
    _require_lock_permission(request)
    previous = activity_theme_service.get_theme_for_scope(data.date, data.space_id)
    before_data = previous.model_dump(mode="json") if previous else None
    theme = activity_theme_service.set_lock(data.date, data.space_id, locked=False)
    request.state.operation_log_context = {
        "content": f"解锁课表：{data.date}",
        "entity_id": theme.id,
        "before_data": before_data,
        "after_data": theme.model_dump(mode="json"),
    }
    return _lock_response(theme, request)


@router.post("")
async def save_theme(data: SaveThemeRequest):
    return activity_theme_service.save_theme(
        data.date,
        data.week_theme,
        data.day_theme,
        data.space_id,
        data.week_theme_detail,
        data.day_theme_detail,
    )


@router.post("/batch")
async def batch_save_themes(data: BatchSaveThemeRequest):
    results = []
    for t in data.themes:
        results.append(
            activity_theme_service.save_theme(
                t.date,
                t.week_theme,
                t.day_theme,
                t.space_id,
                t.week_theme_detail,
                t.day_theme_detail,
            )
        )
    return results
