import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.custom_analysis import (
    AnalysisExecuteRequest,
    AnalysisParseRequest,
    AnalysisTemplateCreate,
    AnalysisTemplateUpdate,
)
from app.services import (
    custom_analysis_service,
    custom_analysis_template_service,
    customer_access_service,
    customer_service,
)

router = APIRouter(
    prefix="/api/custom-analysis",
    tags=["custom-analysis"],
    dependencies=[Depends(require_page_permission("custom-analysis"))],
)


@router.get("/metadata")
async def get_metadata(request: Request):
    actor_id = getattr(request.state, "user_id", "")
    role = getattr(request.state, "user_role", "") or ""
    allowed_customer_ids = customer_access_service.visible_customer_ids(
        request, customer_service.list_customers()
    )
    return await asyncio.to_thread(
        custom_analysis_service.metadata,
        actor_id,
        allowed_customer_ids,
        customer_access_service.transaction_access(role) == "detail",
        customer_access_service.can_view_detail_tab(role, "communication"),
    )


def _actor(request: Request) -> tuple[str, str, bool]:
    actor_id = getattr(request.state, "user_id", "")
    actor_name = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    is_super_admin = getattr(request.state, "user_role", "") == "超级管理员"
    return actor_id, actor_name, is_super_admin


def _condition_snapshot(condition) -> dict:
    value = "跟随统计周期" if condition.inherit_period else condition.value
    if not condition.inherit_period and condition.operator == "between" and isinstance(value, list):
        value = " 至 ".join(str(item) for item in value)
    elif isinstance(value, list):
        value = "、".join(str(item) for item in value)
    elif value is None:
        value = "—"
    return {
        "字段": custom_analysis_service.FIELD_LABELS[condition.field],
        "规则": custom_analysis_service.OPERATOR_LABELS[condition.operator],
        "值": value,
    }


def _template_snapshot(template) -> dict:
    comparison_groups = template.plan.comparison_groups if template.plan.analysis_mode == "comparison" else []
    return {
        "模板名称": template.name,
        "模板简介": template.description or "—",
        "可见范围": "团队共享" if template.scope == "shared" else "仅自己可见",
        "分析模式": "方案对比" if comparison_groups else "单组筛选",
        "筛选条件数": (
            sum(len(group.conditions) for group in comparison_groups)
            if comparison_groups
            else len(template.plan.conditions)
        ),
        "对比组": [group.name for group in comparison_groups],
        "统计指标": [custom_analysis_service.METRIC_LABELS[metric][0] for metric in template.plan.metrics],
        "拆分指标": custom_analysis_service.METRIC_LABELS[template.plan.card_metric][0],
        "拆分维度": custom_analysis_service.CARD_DIMENSION_LABELS[template.plan.card_dimension],
        "列表字段": [custom_analysis_service.FIELD_LABELS[field] for field in template.plan.columns],
    }


def _plan_snapshot(plan, result: dict) -> dict:
    result_total = int(result.get("total") or 0)
    if plan.analysis_mode == "comparison":
        result_groups = {
            str(group.get("id") or ""): group
            for group in result.get("comparison_groups", [])
        }
        def group_date_range(group) -> str:
            if not group.date_from and not group.date_to:
                return "全部时间"
            return f"{group.date_from or '最早'} 至 {group.date_to or '至今'}"

        return {
            "标题": plan.title,
            "分析模式": "方案对比",
            "统计指标": [custom_analysis_service.METRIC_LABELS[item][0] for item in plan.metrics],
            "对比组": [
                {
                    "名称": group.name,
                    "时间范围": group_date_range(group),
                    "条件关系": "全部符合" if group.condition_logic == "all" else "任意一条符合",
                    "筛选条件": [_condition_snapshot(condition) for condition in group.conditions],
                    "结果人数": int(result_groups.get(group.id, {}).get("total") or 0),
                }
                for group in plan.comparison_groups
            ],
            "拆分指标": custom_analysis_service.METRIC_LABELS[plan.card_metric][0],
            "拆分维度": custom_analysis_service.CARD_DIMENSION_LABELS[plan.card_dimension],
            "显示字段": [custom_analysis_service.FIELD_LABELS[item] for item in plan.columns],
            "排序方式": f"{custom_analysis_service.FIELD_LABELS[plan.sort_by]}（{'升序' if plan.sort_order == 'asc' else '降序'}）",
            "各组人数合计": result_total,
        }
    conditions = [_condition_snapshot(condition) for condition in plan.conditions]
    date_range = "全部时间"
    if plan.date_from or plan.date_to:
        date_range = f"{plan.date_from or '最早'} 至 {plan.date_to or '至今'}"
    return {
        "标题": plan.title,
        "时间范围": date_range,
        "条件关系": "全部符合" if plan.condition_logic == "all" else "任意一条符合",
        "筛选条件": conditions,
        "统计指标": [custom_analysis_service.METRIC_LABELS[item][0] for item in plan.metrics],
        "拆分指标": custom_analysis_service.METRIC_LABELS[plan.card_metric][0],
        "拆分维度": custom_analysis_service.CARD_DIMENSION_LABELS[plan.card_dimension],
        "显示字段": [custom_analysis_service.FIELD_LABELS[item] for item in plan.columns],
        "排序方式": f"{custom_analysis_service.FIELD_LABELS[plan.sort_by]}（{'升序' if plan.sort_order == 'asc' else '降序'}）",
        "结果人数": result_total,
    }


@router.get("/templates")
async def list_templates(request: Request):
    actor_id, _, is_super_admin = _actor(request)
    templates = await asyncio.to_thread(custom_analysis_template_service.list_templates, actor_id, is_super_admin)
    return [template.model_dump(mode="json") for template in templates]


@router.post("/templates")
async def create_template(data: AnalysisTemplateCreate, request: Request):
    actor_id, actor_name, _ = _actor(request)
    try:
        template = await asyncio.to_thread(
            custom_analysis_template_service.create_template,
            data,
            actor_id,
            actor_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    request.state.operation_log_context = {
        "entity_id": template.id,
        "content": f"新建分析模板“{template.name}”",
        "after_data": _template_snapshot(template),
    }
    return template.model_dump(mode="json")


@router.patch("/templates/{template_id}")
async def update_template(template_id: str, data: AnalysisTemplateUpdate, request: Request):
    actor_id, _, is_super_admin = _actor(request)
    before = custom_analysis_template_service.get_template(template_id, actor_id, is_super_admin)
    before_data = _template_snapshot(before) if before else None
    try:
        template = await asyncio.to_thread(
            custom_analysis_template_service.update_template,
            template_id,
            data,
            actor_id,
            is_super_admin,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    request.state.operation_log_context = {
        "entity_id": template.id,
        "content": f"编辑分析模板“{template.name}”",
        "before_data": before_data,
        "after_data": _template_snapshot(template),
    }
    return template.model_dump(mode="json")


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, request: Request):
    actor_id, _, is_super_admin = _actor(request)
    template = custom_analysis_template_service.get_template(template_id, actor_id, is_super_admin)
    try:
        deleted = await asyncio.to_thread(
            custom_analysis_template_service.delete_template,
            template_id,
            actor_id,
            is_super_admin,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="模板不存在")
    request.state.operation_log_context = {
        "entity_id": template_id,
        "content": f"删除分析模板“{template.name if template else template_id}”",
        "before_data": _template_snapshot(template) if template else None,
    }
    return {"message": "删除成功"}


@router.post("/templates/{template_id}/use")
async def mark_template_used(template_id: str, request: Request):
    request.state.skip_operation_log = True
    actor_id, _, is_super_admin = _actor(request)
    template = await asyncio.to_thread(custom_analysis_template_service.mark_used, template_id, actor_id, is_super_admin)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template.model_dump(mode="json")


@router.post("/parse")
async def parse_query(data: AnalysisParseRequest, request: Request):
    request.state.skip_operation_log = True
    actor_id = getattr(request.state, "user_id", "")
    return await asyncio.to_thread(custom_analysis_service.parse_query, data.query, actor_id)


@router.post("/execute")
async def execute_query(data: AnalysisExecuteRequest, request: Request):
    actor_id = getattr(request.state, "user_id", "")
    role = getattr(request.state, "user_role", "") or ""
    allow_payment_details = customer_access_service.transaction_access(role) == "detail"
    allow_communication = customer_access_service.can_view_detail_tab(role, "communication")
    payment_fields = set(custom_analysis_service.FIELD_GROUPS["付费行为"])
    all_conditions = list(data.plan.conditions)
    for group in data.plan.comparison_groups:
        all_conditions.extend(group.conditions)
    plan_fields = {
        *(condition.field for condition in all_conditions),
        *data.plan.columns,
        data.plan.sort_by,
        data.plan.card_dimension,
    }
    payment_metrics = {"converted_customers", "payment_orders", "payment_amount"}
    if not allow_payment_details and (
        plan_fields.intersection(payment_fields)
        or set(data.plan.metrics).intersection(payment_metrics)
        or data.plan.card_metric in payment_metrics
    ):
        raise HTTPException(status_code=403, detail="当前角色没有客户交易明细权限，请移除付费相关筛选项")
    if not allow_communication and plan_fields.intersection(custom_analysis_service.FIELD_GROUPS["沟通行为"]):
        raise HTTPException(status_code=403, detail="当前角色没有沟通记录查看权限")
    allowed_customer_ids = customer_access_service.visible_customer_ids(
        request, customer_service.list_customers()
    )
    result = await asyncio.to_thread(
        custom_analysis_service.execute_plan,
        data.plan,
        actor_id,
        data.page,
        data.page_size,
        allowed_customer_ids,
    )
    if data.page == 1:
        comparison_groups = result.get("comparison_groups", [])
        comparison_summary = "、".join(
            f"{group.get('name') or '未命名组'} {int(group.get('total') or 0)}人"
            for group in comparison_groups
        )
        request.state.operation_log_context = {
            "content": (
                f"执行方案对比“{data.plan.title}”：{comparison_summary}"
                if comparison_groups
                else f"执行自定义筛选“{data.plan.title}”：筛选出 {result['total']} 人"
            ),
            "after_data": _plan_snapshot(data.plan, result),
        }
    else:
        request.state.skip_operation_log = True
    return result
