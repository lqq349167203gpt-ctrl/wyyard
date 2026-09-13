from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from app.middleware.jwt_auth import require_page_permission
from app.services import account_service, operation_log_service
from app.utils.pagination import paginate

router = APIRouter(
    prefix="/api/analysis-logs",
    tags=["analysis-logs"],
    dependencies=[Depends(require_page_permission("analysis-logs"))],
)
CHINA_TZ = ZoneInfo("Asia/Shanghai")


def _account_by_operator() -> dict[str, str]:
    """操作人显示名 → 登录账号（用于把记录落到具体账号上）。"""
    mapping: dict[str, str] = {}
    for account in account_service.list_accounts():
        for name in (account.owner, account.username):
            if name:
                mapping.setdefault(name, account.username)
    return mapping


def _analysis_log_type(log) -> str:
    path = log.path.rstrip("/")
    if path == "/api/custom-analysis/execute" and log.method == "POST":
        return "analysis_executed"
    if path == "/api/custom-analysis/export" and log.method == "POST":
        return "analysis_exported"
    if path == "/api/custom-analysis/templates" and log.method == "POST":
        return "template_created"
    if path.startswith("/api/custom-analysis/templates/"):
        if log.method == "PATCH":
            return "template_updated"
        if log.method == "DELETE":
            return "template_deleted"
    return ""


def _conversion_log_type(log) -> str:
    """转化分析（组织/俱乐部页面）的日志类型，和自定义筛选一套口径。"""
    path = log.path.rstrip("/")
    if path == "/api/principal/query" and log.method == "POST":
        return "analysis_executed"
    if path == "/api/principal/export" and log.method == "POST":
        return "analysis_exported"
    if path == "/api/principal/rules" and log.method == "POST":
        return "template_created"
    if path.startswith("/api/principal/rules/"):
        if log.method == "PATCH":
            return "template_updated"
        if log.method == "DELETE":
            return "template_deleted"
    return ""


@router.get("")
def list_analysis_logs(
    operator: Optional[str] = None,
    source: Optional[str] = Query(None, pattern="^(pc|miniprogram)?$"),
    record_type: Optional[str] = Query(None, pattern="^(analysis|export|template)?$"),
    kind: Optional[str] = Query(None, pattern="^(custom|conversion)?$"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    all_logs = []
    # kind=conversion：组织/俱乐部 → 转化分析；默认 custom：自定义筛选
    section = "组织/俱乐部" if kind == "conversion" else "自定义筛选"
    resolve_type = _conversion_log_type if kind == "conversion" else _analysis_log_type
    for log in operation_log_service.list_logs(section=section):
        log_type = resolve_type(log)
        # 组织/俱乐部里经营概况的导出不算转化分析记录（自定义筛选的导出不受影响）
        if kind == "conversion" and log_type == "analysis_exported" and "导出转化分析" not in (log.content or ""):
            log_type = ""
        if log_type:
            all_logs.append((log, log_type))
    account_by_name = _account_by_operator()

    def display_operator(log) -> str:
        """记录落到具体登录账号上：显示名后面带上账号名，重名也能分清。"""
        account = account_by_name.get(log.operator, "")
        if not account or account == log.operator:
            return log.operator
        return f"{log.operator}（{account}）"

    operators = sorted({display_operator(log) for log, _ in all_logs if log.operator})
    filtered = all_logs
    if record_type == "analysis":
        filtered = [(log, log_type) for log, log_type in filtered if log_type == "analysis_executed"]
    elif record_type == "export":
        filtered = [(log, log_type) for log, log_type in filtered if log_type == "analysis_exported"]
    elif record_type == "template":
        filtered = [(log, log_type) for log, log_type in filtered if log_type.startswith("template_")]
    if operator:
        filtered = [(log, log_type) for log, log_type in filtered if display_operator(log) == operator]
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
            "operator": display_operator(log),
            # 记录归属到具体登录账号：显示名可能重名，账号名唯一
            "account": account_by_name.get(log.operator, ""),
            "source": log.source,
            "ip": log.ip,
            "content": log.content,
            "log_type": log_type,
            # 删除类记录优先用删除前的快照；转化分析的删除只写了 after_data，这里兜底
            "config": (
                (log.before_data if log_type == "template_deleted" else log.after_data)
                or log.after_data
                or log.before_data
                or {}
            ),
            "created_at": log.created_at,
        }
        for log, log_type in filtered
    ], page, page_size)
    response["operators"] = operators
    return response
