import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.service_teacher_customers import _xlsx_response
from app.middleware.jwt_auth import require_page_permission
from app.models.operation_log import OperationLogCreate
from app.models.principal import CONDITION_FIELD_ORDER, CONDITION_FIELDS, ConversionRule, PrincipalQuery
from app.services import operation_log_service, principal_service
from app.services.storage import load_data, load_item, save_item
from app.utils.request_context import get_client_ip, get_client_source
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/principal", tags=["组织/俱乐部"], dependencies=[Depends(require_page_permission("principal"))])
RULES_FILE = "principal_rules.json"


def audit(request: Request, content: str, method: str, config: dict | None = None):
    request.state.skip_operation_log = True
    extra = {
        "operator": getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", ""),
        "operator_role": "、".join(get_request_roles(request)), "source": get_client_source(request),
        "method": method, "path": request.url.path, "ip": get_client_ip(request),
    }
    if config is not None:
        extra["after_data"] = config
    operation_log_service.create_log(OperationLogCreate(section="组织/俱乐部", content=content), extra=extra)


def _condition_rows(scope_name: str, conditions: list[dict]) -> list[dict]:
    """把规则里的条件翻成「字段 / 规则 / 值」，和自定义筛选的分析日志同一套展示。"""
    from app.services.custom_analysis_service import FIELD_LABELS, OPERATOR_LABELS

    rows = []
    for condition in conditions or []:
        value = condition.get("value")
        if isinstance(value, list):
            value = "、".join(str(item) for item in value)
        rows.append({
            "字段": f"{scope_name} · {FIELD_LABELS.get(condition.get('field'), condition.get('field'))}",
            "规则": OPERATOR_LABELS.get(condition.get("operator"), condition.get("operator")),
            "值": "" if value is None else value,
        })
    return rows


def _action_text(action: dict) -> str:
    labels = {key: label for key, label, _, _ in principal_service.PRODUCTS}
    kinds = {"coarse_usage": "粗门次卡扣卡", "purchase": "购买", "attendance": "到场参与"}
    occurrence = {"first": "首次", "any": "任意一次"}
    parts = [occurrence.get(action.get("occurrence"), ""), kinds.get(action.get("kind"), action.get("kind"))]
    if action.get("product"):
        parts.append(labels.get(action.get("product"), action.get("product")))
    if action.get("subtype"):
        parts.append(action.get("subtype"))
    return " ".join(item for item in parts if item)


def conversion_log_config(
    rule: dict,
    *,
    organization: str = "全部可见组织/俱乐部",
    time_range: str = "",
    status: str = "",
    summary: dict | None = None,
) -> dict:
    """转化分析的一次记录：模板、范围、规则、条件（和自定义筛选的分析日志同结构）。"""
    # 使用者自己加的条件（起点/目标各自附加的筛选）
    user_conditions = _condition_rows("起点", (rule.get("source") or {}).get("conditions") or [])
    for action in rule.get("targets") or []:
        user_conditions += _condition_rows("目标", action.get("conditions") or [])
    targets = rule.get("targets") or []
    target_text = "、".join(_action_text(action) for action in targets)
    # 记录里要能看出「这次筛的是什么范围、按哪条转化路径算」，所以把范围与路径也列成条件行
    conditions = [
        {"字段": "范围 · 组织/俱乐部", "规则": "是", "值": organization},
        {"字段": "范围 · 统计周期", "规则": "是", "值": time_range or "全部时间"},
        {"字段": "范围 · 状态", "规则": "是", "值": status or "全部"},
        {"字段": "转化路径 · 起点", "规则": "是", "值": _action_text(rule.get("source") or {})},
        {"字段": "转化路径 · 目标", "规则": "是", "值": f"{target_text}（{rule.get('window_days', 0)} 天内{'，同组织' if rule.get('same_organization') else '，不限组织'}）"},
        *user_conditions,
    ]
    config = {
        "分析模式": "转化分析",
        "模板名称": rule.get("name", ""),
        "模板简介": rule.get("description") or "—",
        "可见范围": "共享" if rule.get("scope") == "shared" else "个人",
        "组织/俱乐部": organization,
        "时间范围": time_range or "全部时间",
        "条件关系": "全部符合",
        "筛选条件数": len(conditions),
        "附加条件数": len(user_conditions),
        "筛选条件": conditions,
        "起点": _action_text(rule.get("source") or {}),
        "目标": target_text + f"（{rule.get('window_days', 0)} 天内{'，同组织' if rule.get('same_organization') else '，不限组织'}）",
        "状态筛选": status or "全部",
        "规则": rule,
    }
    if summary is not None:
        config["结果人数"] = summary.get("符合条件人数", 0)
        config["结果单位"] = "人"
        config["转化结果"] = summary
    return config


def conversion_log_snapshot(request: Request, data: PrincipalQuery, result: dict) -> dict:
    """转化分析这次筛选的完整快照：模板、范围、规则、条件、结果都留下来。"""
    organization = "全部可见组织/俱乐部"
    if data.organization_id:
        organizations, _, _ = principal_service.scope(request)
        organization = next((org.name for org in organizations if org.id == data.organization_id), data.organization_id)
    return conversion_log_config(
        data.rule.model_dump(),
        organization=organization,
        time_range=f"{data.date_from.isoformat() if data.date_from else '最早'} 至 {data.date_to.isoformat() if data.date_to else '今天'}",
        status=data.status,
        summary=result.get("summary", {}),
    )


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


@router.get("/rule-fields")
def rule_fields(request: Request):
    """转化分析可加的条件字段：字段定义、操作符、候选项都与自定义筛选同源。"""
    from app.services import custom_analysis_service

    _, customers, permissions = principal_service.scope(request)
    access = permissions["customer_access"]["transaction_access"]
    meta = custom_analysis_service.metadata(
        getattr(request.state, "user_id", ""),
        allowed_customer_ids=set(customers),
        allow_payment_details=access == "detail",
        allow_communication=False,
    )
    by_name = {field["value"]: field for field in meta["fields"] if field["value"] in CONDITION_FIELDS}
    return {
        "fields": [by_name[name] for name in CONDITION_FIELD_ORDER if name in by_name],
        "operators": meta["operators"],
    }


@router.post("/query")
def query(data: PrincipalQuery, request: Request):
    result = principal_service.analyze(request, data)
    if data.tab == "conversion" and data.log_analysis:
        # 转化分析：只有主动点「查询」这次才写进「分析日志」（切 tab、翻页不记）
        snapshot = conversion_log_snapshot(request, data, result)
        request.state.operation_log_context = {
            "content": (
                f"执行转化分析：{snapshot['组织/俱乐部']} · {snapshot['时间范围']}"
                f"，符合条件 {result.get('total', 0)} 人"
            ),
            "after_data": snapshot,
        }
    else:
        # 经营概况属于看数面板，不逐次记日志，避免刷屏
        request.state.skip_operation_log = True
    return result


@router.post("/export")
def export(data: PrincipalQuery, request: Request):
    if data.export_view == "traffic":
        data = data.model_copy(update={"tab": "overview"})
    result = principal_service.analyze(request, data, export=True)
    if data.export_view == "traffic":
        fields = [
            ("name", "昵称"), ("referral_date", "引流日期"), ("referrer", "引流人"),
            ("referrer_handler", "承接人"), ("identity", "会员身份"),
            ("follow_up_status", "跟进阶段"), ("traffic_source", "流量来源"),
            ("tags", "客户标签"), ("deals", "交易笔数"), ("invite_count", "邀约次数"),
            ("cancel_count", "取消次数"), ("arrive_count", "到店次数"),
            ("visit_interval", "平均到店间隔"), ("activity_count", "参与活动"),
        ]
        # 从同一权限过滤后的引流列表取数据，忽略客户端传入的无权访问或已失效 ID。
        customers = {
            customer["id"]: {**customer, "referrer": group["label"]}
            for group in result.get("breakdown", {}).get("traffic", [])
            for customer in group.get("customers", [])
        }
        ids = data.export_customer_ids if data.export_customer_ids is not None else list(customers)
        items = []
        for customer_id in dict.fromkeys(ids):
            if customer_id not in customers:
                continue
            customer = customers[customer_id]
            items.append({**customer, "tags": "、".join(customer.get("tags") or []), "details": []})
        result = {**result, "columns": [{"key": key, "label": label} for key, label in fields],
                  "items": items, "total": len(items)}
    columns = result["columns"]
    rows = [[item.get(c["key"], "") for c in columns] + ["\n".join(item["details"])] for item in result["items"]]
    # 阻止用户文本在 Excel 中成为公式。
    rows = [["'" + value if isinstance(value, str) and value.startswith(("=", "+", "-", "@")) else value for value in row] for row in rows]
    label = "导出引流客户" if data.export_view == "traffic" else "导出转化分析" if data.tab == "conversion" else "导出组织/俱乐部"
    suffix = f"，规则：{data.rule.name}" if data.tab == "conversion" else f"，{data.tab}"
    audit(request, f"{label}：{result['total']}条{suffix}", "EXPORT")
    # Excel 工作表名不允许包含 “/”，用去掉斜杠的名称
    return _xlsx_response("组织俱乐部", [c["label"] for c in columns] + ["关联明细"], rows, "组织俱乐部.xlsx")


@router.get("/rules")
def list_rules(request: Request):
    actor_id, _, is_super_admin = rule_actor(request)
    rules = [
        rule_view(record, actor_id, is_super_admin)
        for record in load_data(RULES_FILE).values()
        if rule_visible(record, actor_id, is_super_admin)
    ]
    # 先按更新时间倒序，再把自己的排到前面（稳定排序保留时间序）
    rules.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    rules.sort(key=lambda item: 0 if item.get("owner_id") == actor_id else 1)
    return rules


def rule_actor(request: Request) -> tuple[str, str, bool]:
    """当前操作人：账号 id、显示名、是否超管。规则只用账号 id 判断归属。"""
    actor_id = getattr(request.state, "user_id", "")
    actor_name = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    return actor_id, actor_name, "超级管理员" in get_request_roles(request)


def rule_visible(record: dict, actor_id: str, is_super_admin: bool) -> bool:
    """自己的规则 + 别人共享的规则可见；超管不受限。"""
    if record.get("is_deleted"):
        return False
    return is_super_admin or record.get("owner_id") == actor_id or record.get("rule", {}).get("scope") == "shared"


def rule_view(record: dict, actor_id: str, is_super_admin: bool) -> dict:
    """对外补上归属信息，前端据此决定能否更新、删除。"""
    return {
        **record,
        "owner_name": record.get("owner_name", ""),
        "can_manage": is_super_admin or record.get("owner_id") == actor_id,
    }


def readable_rule(rule_id: str, request: Request) -> dict:
    actor_id, _, is_super_admin = rule_actor(request)
    record = load_item(RULES_FILE, rule_id)
    if not record or not rule_visible(record, actor_id, is_super_admin):
        raise HTTPException(404, "规则不存在或无权查看")
    return record


def manageable_rule(rule_id: str, request: Request) -> dict:
    actor_id, _, is_super_admin = rule_actor(request)
    record = readable_rule(rule_id, request)
    if not is_super_admin and record.get("owner_id") != actor_id:
        raise HTTPException(403, "只能修改或删除自己创建的规则")
    return record


@router.post("/rules")
def create_rule(data: ConversionRule, request: Request):
    actor_id, actor_name, _ = rule_actor(request)
    record = {"id": str(uuid.uuid4()), "owner_id": actor_id, "owner_name": actor_name, "rule": data.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    save_item(RULES_FILE, record["id"], record)
    audit(request, f"新增转化规则：{data.name}", "POST", conversion_log_config(data.model_dump()))
    return record


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: str, data: ConversionRule, request: Request):
    record = manageable_rule(rule_id, request)
    record.update(rule=data.model_dump(), updated_at=datetime.now(timezone.utc).isoformat())
    save_item(RULES_FILE, rule_id, record)
    audit(request, f"修改转化规则：{data.name}", "PATCH", conversion_log_config(data.model_dump()))
    return record


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, request: Request):
    record = manageable_rule(rule_id, request)
    record["is_deleted"] = True
    save_item(RULES_FILE, rule_id, record)
    audit(request, f"删除转化规则：{record['rule']['name']}", "DELETE", conversion_log_config(record["rule"]))
    return {"success": True}
