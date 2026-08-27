import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.custom_analysis import (
    AnalysisExecuteRequest,
    AnalysisParseRequest,
    AnalysisTemplateCreate,
    AnalysisTemplateUpdate,
)
from app.services import custom_analysis_service, custom_analysis_template_service

router = APIRouter(
    prefix="/api/custom-analysis",
    tags=["custom-analysis"],
    dependencies=[Depends(require_page_permission("custom-analysis"))],
)


@router.get("/metadata")
async def get_metadata(request: Request):
    actor_id = getattr(request.state, "user_id", "")
    return await asyncio.to_thread(custom_analysis_service.metadata, actor_id)


def _actor(request: Request) -> tuple[str, str, bool]:
    actor_id = getattr(request.state, "user_id", "")
    actor_name = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")
    is_super_admin = getattr(request.state, "user_role", "") == "超级管理员"
    return actor_id, actor_name, is_super_admin


def _template_snapshot(template) -> dict:
    return {
        "模板名称": template.name,
        "模板简介": template.description or "—",
        "可见范围": "团队共享" if template.scope == "shared" else "仅自己可见",
        "筛选条件数": len(template.plan.conditions),
        "统计指标": [custom_analysis_service.METRIC_LABELS[metric][0] for metric in template.plan.metrics],
        "列表字段": [custom_analysis_service.FIELD_LABELS[field] for field in template.plan.columns],
    }


def _plan_snapshot(plan, result_total: int) -> dict:
    conditions = []
    for condition in plan.conditions:
        value = condition.value
        if condition.operator == "between" and isinstance(value, list):
            value = " 至 ".join(str(item) for item in value)
        elif isinstance(value, list):
            value = "、".join(str(item) for item in value)
        elif value is None:
            value = "—"
        conditions.append({
            "字段": custom_analysis_service.FIELD_LABELS[condition.field],
            "规则": custom_analysis_service.OPERATOR_LABELS[condition.operator],
            "值": value,
        })
    date_range = "全部时间"
    if plan.date_from or plan.date_to:
        date_range = f"{plan.date_from or '最早'} 至 {plan.date_to or '至今'}"
    return {
        "标题": plan.title,
        "时间范围": date_range,
        "条件关系": "全部符合" if plan.condition_logic == "all" else "任意一条符合",
        "筛选条件": conditions,
        "统计指标": [custom_analysis_service.METRIC_LABELS[item][0] for item in plan.metrics],
        "拆分方式": custom_analysis_service.CARD_DIMENSION_LABELS[plan.card_dimension],
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
    result = await asyncio.to_thread(
        custom_analysis_service.execute_plan,
        data.plan,
        actor_id,
        data.page,
        data.page_size,
    )
    if data.page == 1:
        request.state.operation_log_context = {
            "content": f"执行自定义筛选“{data.plan.title}”：筛选出 {result['total']} 人",
            "after_data": _plan_snapshot(data.plan, result["total"]),
        }
    else:
        request.state.skip_operation_log = True
    return result
