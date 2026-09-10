from fastapi import APIRouter, HTTPException, Query, Request

from app.models.base import StrictBaseModel
from app.models.project_deduction import ProjectDeductionCreate
from app.services import customer_access_service, customer_service, project_deduction_service
from app.utils.pagination import paginate
from app.utils.record_ownership import ensure_payment_record_manager, get_request_actor

router = APIRouter(prefix="/api/project-deductions", tags=["project-deductions"])


class CoarseDoorCourseDeductionCreate(StrictBaseModel):
    customer_id: str
    record_type: str
    record_id: str
    # organization_id 兼容旧版客户端，旧版仍按课程组织处理并作为结算组织。
    organization_id: str = ""
    course_organization_id: str = ""
    settlement_organization_id: str = ""
    deal_date: str = ""
    closers: list[dict] = []
    notes: str = ""


@router.get("/coarse-door-options")
def get_coarse_door_options(customer_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, customer_id)
    return project_deduction_service.get_coarse_door_options(customer_id)


@router.post("/coarse-door-course")
def create_coarse_door_course(data: CoarseDoorCourseDeductionCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="销卡")
    _, actor_name = get_request_actor(request)
    course_organization_id = data.course_organization_id or data.organization_id
    settlement_organization_id = data.settlement_organization_id or course_organization_id
    try:
        deduction = project_deduction_service.create_coarse_door_course_deduction(
            data.customer_id,
            data.record_type,
            data.record_id,
            course_organization_id,
            settlement_organization_id,
            data.deal_date,
            data.closers,
            data.notes,
            actor_name,
        )
        result = deduction.model_dump(mode="json")
        course_summary = " · ".join(
            value
            for value in (
                deduction.source_activity_date,
                deduction.source_organization_name,
                deduction.source_activity_name,
            )
            if value
        )
        request.state.operation_log_context = {
            "content": (
                f"{deduction.nickname} · 粗门次卡抵扣："
                f"成交日期{deduction.deduction_date} · {course_summary or '所选课程'} · "
                f"成交归属{deduction.organization_name or '-'} · "
                f"抵扣{deduction.count}次，原会员卡返还{deduction.count}次"
            ),
            "entity_id": deduction.id,
            "after_data": result,
        }
        return result
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.get("")
def list_deductions(request: Request, customer_id: str | None = Query(None), nickname: str | None = Query(None), project_type: str | None = Query(None), card_type: str | None = Query(None), page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), manual_only: bool = Query(False)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = [d.model_dump(mode="json") for d in project_deduction_service.list_deductions(customer_id, nickname, project_type)]
    items = customer_access_service.filter_record_dicts(request, items)
    if manual_only:
        items = [i for i in items if i.get("project_name") != project_deduction_service.COARSE_DOOR_CARD_TYPE]
    if card_type:
        items = [i for i in items if i.get("project_name") == card_type]
    if card_type == project_deduction_service.COARSE_DOOR_CARD_TYPE:
        items.sort(
            key=lambda item: (item.get("deduction_date") or "", item.get("created_at") or ""),
            reverse=True,
        )
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
def create_deduction(data: ProjectDeductionCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="销卡")
    try:
        _, actor = get_request_actor(request)
        data = data.model_copy(update={"created_by": actor})
        return project_deduction_service.create_deduction(data).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class DeductionUpdate(StrictBaseModel):
    count: int
    reason: str | None = None
    updated_by: str = ""


@router.patch("/{deduction_id}")
def update_deduction(deduction_id: str, data: DeductionUpdate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = next(
        (item for item in project_deduction_service.list_deductions() if item.id == deduction_id),
        None,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="销卡记录不存在")
    ensure_payment_record_manager(request, existing)
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    try:
        return project_deduction_service.update_deduction(
            deduction_id,
            data.count,
            get_request_actor(request)[1],
            data.reason,
        ).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{deduction_id}")
def delete_deduction(deduction_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = next(
        (item for item in project_deduction_service.list_deductions() if item.id == deduction_id),
        None,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="销卡记录不存在")
    ensure_payment_record_manager(request, existing)
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    try:
        project_deduction_service.delete_deduction(deduction_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/available-items")
def get_available_items(customer_id: str, project_type: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, customer_id)
    return project_deduction_service.get_available_items(customer_id, project_type)


class AutoDeductRequest(StrictBaseModel):
    nickname: str
    project_type: str
    count: int = 1
    created_by: str = ""
    name_filter: str = ""


@router.post("/auto")
def auto_deduct(data: AutoDeductRequest, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer = customer_service.get_by_nickname(data.nickname)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    customer_access_service.require_customer_scope(request, customer.id, action="销卡")
    try:
        return project_deduction_service.auto_deduct(
            data.nickname,
            data.project_type,
            data.count,
            get_request_actor(request)[1],
            data.name_filter,
            "Excel批量导入销卡",
        ).model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
