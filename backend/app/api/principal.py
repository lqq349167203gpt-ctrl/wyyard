import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.service_teacher_customers import _xlsx_response
from app.middleware.jwt_auth import require_page_permission
from app.models.operation_log import OperationLogCreate
from app.models.principal import ConversionRule, PrincipalQuery
from app.services import operation_log_service, principal_service
from app.services.storage import load_data, load_item, save_item
from app.utils.request_context import get_client_ip, get_client_source
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/principal", tags=["主理人"], dependencies=[Depends(require_page_permission("principal"))])
RULES_FILE = "principal_rules.json"


def audit(request: Request, content: str, method: str):
    request.state.skip_operation_log = True
    operation_log_service.create_log(OperationLogCreate(section="主理人", content=content), extra={
        "operator": getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", ""),
        "operator_role": "、".join(get_request_roles(request)), "source": get_client_source(request),
        "method": method, "path": request.url.path, "ip": get_client_ip(request),
    })


@router.get("/metadata")
def metadata(request: Request):
    organizations, permissions, events, _ = principal_service.collect_data(request)
    options = []
    for key, label, _, _field in principal_service.PRODUCTS:
        options.append({"key": key, "label": label, "subtypes": sorted({e["subtype"] for e in events if e["kind"] == "purchase" and e["product"] == key and e["subtype"]})})
    return {"organizations": [{"id": o.id, "name": o.name} for o in organizations],
            "scope": permissions["principal_scope"], "products": options,
            "transaction_access": permissions["customer_access"]["transaction_access"],
            "activity_types": [{"key": k, "label": label, "subtypes": sorted({e["subtype"] for e in events if e["kind"] == "attendance" and e["product"] == k and e["subtype"]})} for k, label in [("class", "沙龙活动"), ("gcs", "觉醒游戏"), ("ers", "情绪释放"), ("eks", "能量结"), ("ics", "内部课程")]]}


@router.post("/query")
def query(data: PrincipalQuery, request: Request):
    request.state.skip_operation_log = True
    return principal_service.analyze(request, data)


@router.post("/export")
def export(data: PrincipalQuery, request: Request):
    result = principal_service.analyze(request, data, export=True)
    columns = result["columns"]
    rows = [[item.get(c["key"], "") for c in columns] + ["\n".join(item["details"])] for item in result["items"]]
    # 阻止用户文本在 Excel 中成为公式。
    rows = [["'" + value if isinstance(value, str) and value.startswith(("=", "+", "-", "@")) else value for value in row] for row in rows]
    audit(request, f"导出主理人：{data.tab}，{result['total']}条，规则：{data.rule.name}", "EXPORT")
    return _xlsx_response("主理人", [c["label"] for c in columns] + ["关联明细"], rows, "主理人.xlsx")


@router.get("/rules")
def list_rules(request: Request):
    owner_id = getattr(request.state, "user_id", "")
    return sorted([r for r in load_data(RULES_FILE).values() if r.get("owner_id") == owner_id and not r.get("is_deleted")], key=lambda r: r["updated_at"], reverse=True)


def owned_rule(rule_id: str, request: Request):
    record = load_item(RULES_FILE, rule_id)
    if not record or record.get("is_deleted") or record.get("owner_id") != getattr(request.state, "user_id", ""):
        raise HTTPException(404, "规则不存在或无权操作")
    return record


@router.post("/rules")
def create_rule(data: ConversionRule, request: Request):
    record = {"id": str(uuid.uuid4()), "owner_id": request.state.user_id, "rule": data.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    save_item(RULES_FILE, record["id"], record)
    audit(request, f"新增转化规则：{data.name}", "POST")
    return record


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: str, data: ConversionRule, request: Request):
    record = owned_rule(rule_id, request)
    record.update(rule=data.model_dump(), updated_at=datetime.now(timezone.utc).isoformat())
    save_item(RULES_FILE, rule_id, record)
    audit(request, f"修改转化规则：{data.name}", "PATCH")
    return record


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, request: Request):
    record = owned_rule(rule_id, request)
    record["is_deleted"] = True
    save_item(RULES_FILE, rule_id, record)
    audit(request, f"删除转化规则：{record['rule']['name']}", "DELETE")
    return {"success": True}
