"""客户联系方式脱敏、授权访问与审计辅助。"""

from typing import Literal

from app.models.operation_log import OperationLogCreate
from app.services import operation_log_service, position_edit_permission_service

ContactField = Literal["phone", "wechat"]
ContactAction = Literal["view", "copy", "edit"]


def mask_phone(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) >= 7:
        return f"{value[:3]}****{value[-4:]}"
    if len(value) <= 2:
        return "*" * len(value)
    return f"{value[0]}{'*' * (len(value) - 2)}{value[-1]}"


def mask_wechat(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) <= 2:
        return "*" * len(value)
    visible_left = min(3, max(1, len(value) // 3))
    visible_right = 2 if len(value) >= 6 else 1
    hidden_count = max(4, len(value) - visible_left - visible_right)
    return f"{value[:visible_left]}{'*' * hidden_count}{value[-visible_right:]}"


def mask_contact(field: ContactField, value: str) -> str:
    return mask_phone(value) if field == "phone" else mask_wechat(value)


def get_role_permissions(role: str) -> dict:
    return position_edit_permission_service.get_permissions(role)["contacts"]


def can_access(role: str, field: ContactField, action: ContactAction) -> bool:
    return position_edit_permission_service.has_contact_permission(role, field, action)


def protect_customer_data(data: dict, role: str, *, include_permissions: bool = False) -> dict:
    """员工接口统一返回脱敏联系方式；明文只能通过受审计的访问端点获取。"""
    protected = dict(data)
    protected["phone"] = mask_phone(str(protected.get("phone") or ""))
    protected["wechat"] = mask_wechat(str(protected.get("wechat") or ""))
    if include_permissions:
        protected["contact_permissions"] = get_role_permissions(role)
    return protected


def record_access(
    *,
    field: ContactField,
    action: Literal["view", "copy"],
    customer_id: str,
    customer_name: str,
    operator: str,
    operator_role: str,
    source: str,
    ip: str,
) -> None:
    field_label = "手机号" if field == "phone" else "微信号"
    action_label = "查看" if action == "view" else "复制"
    operation_log_service.create_log(
        OperationLogCreate(
            section="客户资料",
            content=f'{action_label}客户“{customer_name}”的{field_label}',
        ),
        extra={
            "operator": operator,
            "operator_role": operator_role,
            "source": source,
            "method": action.upper(),
            "path": f"/api/customers/{customer_id}/contact-access",
            "entity_id": customer_id,
            "ip": ip,
            "before_data": None,
            "after_data": {"customer_name": customer_name, "contact_field": field_label},
        },
    )
