from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from app.middleware.jwt_auth import require_page_permission
from app.services import operation_log_service
from app.utils.pagination import paginate

router = APIRouter(
    prefix="/api/analysis-logs",
    tags=["analysis-logs"],
    dependencies=[Depends(require_page_permission("analysis-logs"))],
)
CHINA_TZ = ZoneInfo("Asia/Shanghai")


def _analysis_log_type(log) -> str:
    path = log.path.rstrip("/")
    if path == "/api/custom-analysis/execute" and log.method == "POST":
        return "analysis_executed"
    if path == "/api/custom-analysis/templates" and log.method == "POST":
        return "template_created"
    if path.startswith("/api/custom-analysis/templates/"):
        if log.method == "PATCH":
            return "template_updated"
        if log.method == "DELETE":
            return "template_deleted"
    return ""


@router.get("")
def list_analysis_logs(
    operator: Optional[str] = None,
    source: Optional[str] = Query(None, pattern="^(pc|miniprogram)?$"),
    record_type: Optional[str] = Query(None, pattern="^(analysis|template)?$"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    all_logs = []
    for log in operation_log_service.list_logs(section="自定义筛选"):
        log_type = _analysis_log_type(log)
        if log_type:
            all_logs.append((log, log_type))
    operators = sorted({log.operator for log, _ in all_logs if log.operator})
    filtered = all_logs
    if record_type == "analysis":
        filtered = [(log, log_type) for log, log_type in filtered if log_type == "analysis_executed"]
    elif record_type == "template":
        filtered = [(log, log_type) for log, log_type in filtered if log_type.startswith("template_")]
    if operator:
        filtered = [(log, log_type) for log, log_type in filtered if log.operator == operator]
    if source:
        filtered = [(log, log_type) for log, log_type in filtered if log.source == source]
    if date_from:
        filtered = [
            (log, log_type) for log, log_type in filtered
            if log.created_at.astimezone(CHINA_TZ).date().isoformat() >= date_from
        ]
    if date_to:
        filtered = [
            (log, log_type) for log, log_type in filtered
            if log.created_at.astimezone(CHINA_TZ).date().isoformat() <= date_to
        ]

    response = paginate([
        {
            "id": log.id,
            "operator": log.operator,
            "source": log.source,
            "ip": log.ip,
            "content": log.content,
            "log_type": log_type,
            "config": (log.before_data if log_type == "template_deleted" else log.after_data) or {},
            "created_at": log.created_at,
        }
        for log, log_type in filtered
    ], page, page_size)
    response["operators"] = operators
    return response
