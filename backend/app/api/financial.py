from datetime import date

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.financial import CommissionCreate, StaffBenefitCreate
from app.services import financial_record_service, financial_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/financial", tags=["financial"])


def _operator(request: Request) -> str:
    return getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""


def _set_log_context(request: Request, *, entity_id: str, before_data=None, after_data=None) -> None:
    context = {"entity_id": entity_id}
    if before_data is not None:
        context["before_data"] = before_data.model_dump(mode="json")
    if after_data is not None:
        context["after_data"] = after_data.model_dump(mode="json")
    request.state.operation_log_context = context


@router.get("/overview")
def get_overview(
    date_from: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    try:
        start_date = date.fromisoformat(date_from)
        end_date = date.fromisoformat(date_to)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="日期格式不正确") from error
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    return financial_service.get_overview(date_from, date_to)


@router.get("/revenue-details")
def list_revenue_details(
    date_from: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    category: str = Query(pattern=r"^(group|custom)$"),
    name: str = Query(min_length=1, max_length=200),
):
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    return {"data": financial_service.list_revenue_details(date_from, date_to, category, name)}


@router.get("/composition-details")
def list_composition_details(
    date_from: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    kind: str = Query(pattern=r"^(expense|refund)$"),
):
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    return {"data": financial_service.list_composition_details(date_from, date_to, kind)}


@router.get("/commissions")
def list_commissions(
    month: str = Query("", pattern=r"^(|\d{4}-\d{2})$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    items = [item.model_dump(mode="json") for item in financial_record_service.list_commissions(month)]
    return paginate(items, page, page_size)


@router.post("/commissions")
def create_commission(data: CommissionCreate, request: Request):
    created = financial_record_service.create_commission(data, _operator(request))
    _set_log_context(request, entity_id=created.id, after_data=created)
    return created.model_dump(mode="json")


@router.put("/commissions/{record_id}")
def update_commission(record_id: str, data: CommissionCreate, request: Request):
    try:
        before = financial_record_service.get_commission(record_id)
        updated = financial_record_service.update_commission(record_id, data, _operator(request))
        _set_log_context(request, entity_id=record_id, before_data=before, after_data=updated)
        return updated.model_dump(mode="json")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/commissions/{record_id}")
def delete_commission(record_id: str, request: Request):
    try:
        before = financial_record_service.get_commission(record_id)
        financial_record_service.delete_commission(record_id, _operator(request))
        _set_log_context(request, entity_id=record_id, before_data=before)
        return {"message": "删除成功"}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/staff-benefits")
def list_staff_benefits(
    date_from: str = Query("", max_length=10),
    date_to: str = Query("", max_length=10),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    items = [item.model_dump(mode="json") for item in financial_record_service.list_benefits(date_from, date_to)]
    return paginate(items, page, page_size)


@router.post("/staff-benefits")
def create_staff_benefit(data: StaffBenefitCreate, request: Request):
    created = financial_record_service.create_benefit(data, _operator(request))
    _set_log_context(request, entity_id=created.id, after_data=created)
    return created.model_dump(mode="json")


@router.put("/staff-benefits/{record_id}")
def update_staff_benefit(record_id: str, data: StaffBenefitCreate, request: Request):
    try:
        before = financial_record_service.get_benefit(record_id)
        updated = financial_record_service.update_benefit(record_id, data, _operator(request))
        _set_log_context(request, entity_id=record_id, before_data=before, after_data=updated)
        return updated.model_dump(mode="json")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/staff-benefits/{record_id}")
def delete_staff_benefit(record_id: str, request: Request):
    try:
        before = financial_record_service.get_benefit(record_id)
        financial_record_service.delete_benefit(record_id, _operator(request))
        _set_log_context(request, entity_id=record_id, before_data=before)
        return {"message": "删除成功"}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
