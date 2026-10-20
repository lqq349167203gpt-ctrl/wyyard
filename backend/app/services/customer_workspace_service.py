"""小程序客户工作视图；在原有数据权限内进一步按本人归属筛选。"""

from fastapi import HTTPException

from app.models.customer import customer_referrers
from app.services import customer_access_service, position_edit_permission_service
from app.services.storage import load_item, save_item
from app.utils.request_roles import get_request_roles

WORKSPACES = {"handoff": "承接端", "referral": "引流端", "sales": "sales端"}
ADMIN_WORKSPACES = {"all": "全部客户", "referral": "引流端", "handoff": "承接端", "sales": "sales端"}
PREFERENCES_FILE = "customer_workspace_preferences.json"


def is_super_admin(request) -> bool:
    return "超级管理员" in get_request_roles(request)


def available_workspaces(request) -> list[dict]:
    if is_super_admin(request):
        return [{"key": key, "label": label} for key, label in ADMIN_WORKSPACES.items()]
    configured = position_edit_permission_service.get_permissions(get_request_roles(request)).get("customer_workspaces", [])
    return [{"key": key, "label": label} for key, label in WORKSPACES.items() if key in configured]


def workspace_settings(request) -> dict:
    options = available_workspaces(request)
    keys = [item["key"] for item in options]
    admin = is_super_admin(request)
    saved = (load_item(PREFERENCES_FILE, request.state.user_id) or {}) if admin else {}
    visible = [key for key in keys if key in saved.get("visible_workspaces", keys)]
    if admin and "all" not in visible:
        visible.insert(0, "all")
    default = saved.get("default_workspace")
    return {"is_admin": admin, "options": options, "visible_workspaces": visible,
            "default_workspace": default if default in visible else (visible[0] if visible else "")}


def save_workspace_settings(request, visible: list[str], default: str) -> dict:
    if not is_super_admin(request):
        raise HTTPException(403, "仅超级管理员可设置个人客户界面")
    if "all" not in visible or default not in visible:
        raise HTTPException(422, "请保留全部客户，并选择已显示的默认入口")
    # 仅保存个人显示偏好，不写入角色或账号权限。
    save_item(PREFERENCES_FILE, request.state.user_id,
              {"visible_workspaces": [key for key in ADMIN_WORKSPACES if key in visible],
               "default_workspace": default})
    return workspace_settings(request)


def is_handler(request, customer) -> bool:
    owner = customer_access_service.actor_name(request)
    handoff = customer.handoff
    if handoff and handoff.handler_account_id:
        return handoff.handler_account_id == getattr(request.state, "user_id", "")
    return bool(owner and customer.referrer_handler.strip() == owner)


def filter_workspace(request, customers, workspace=None, handoff_status="pending", workspace_owner=None):
    admin = is_super_admin(request)
    if workspace_owner is not None and not admin:
        raise HTTPException(403, "仅超级管理员可切换负责人范围")
    if not workspace:
        return customers
    if workspace not in {item["key"] for item in available_workspaces(request)}:
        raise HTTPException(403, "未开通此客户视图，请联系管理员")
    if workspace == "all":
        return customers
    owner = (workspace_owner or "").strip() if admin else customer_access_service.actor_name(request)
    if not owner and not admin:
        raise HTTPException(403, "账号尚未绑定归属人，请联系管理员")
    if workspace == "referral":
        return [customer for customer in customers if not owner or owner in customer_referrers(customer)]
    if workspace == "sales":
        return [customer for customer in customers if not owner or customer.service_teacher.strip() == owner]
    result = ([customer for customer in customers if customer.referrer_handler.strip()
               and (not owner or customer.referrer_handler.strip() == owner)] if admin
              else [customer for customer in customers if is_handler(request, customer)])
    if handoff_status == "all":
        return result
    if handoff_status == "history":
        return [customer for customer in result if customer.handoff is None]
    return [customer for customer in result if customer.handoff
            and bool(customer.handoff.accepted_at) == (handoff_status == "accepted")]
