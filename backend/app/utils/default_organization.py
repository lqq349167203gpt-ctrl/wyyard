"""新付费记录统一归属核心组织；不修改历史记录。"""
from fastapi import HTTPException


def payment_organization_id() -> str:
    from app.services import organization_service

    organizations = organization_service.list_organizations()
    for name in ("无忧茶院", "无忧茶苑"):
        for org in organizations:
            if org.name.strip() == name and org.status != "archived":
                return org.id
    raise HTTPException(400, "未找到可用的无忧茶院，请联系管理员检查组织配置")
