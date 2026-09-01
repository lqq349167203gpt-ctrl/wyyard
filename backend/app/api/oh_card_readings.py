from fastapi import APIRouter, HTTPException, Query, Request

from app.models.oh_card_reading import OhCardReadingCreate
from app.services import customer_access_service, oh_card_reading_service
from app.utils.pagination import paginate
from app.utils.payment_validation import ensure_payment_closer_total
from app.utils.record_ownership import ensure_payment_record_manager, stamp_payment_creator

router = APIRouter(prefix="/api/oh-card-readings", tags=["oh-card-readings"])


@router.get("")
def list_readings(request: Request, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = oh_card_reading_service.list_readings()
    items_dict = [i.model_dump() if hasattr(i, "model_dump") else i for i in items]
    items_dict = customer_access_service.filter_record_dicts(request, items_dict)
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items_dict = [i for i in items_dict if i.get("customer_id") in allowed]
    if nickname:
        kw = nickname.lower()
        items_dict = [i for i in items_dict if kw in (i.get("nickname") or "").lower()]
    if closer_name:
        kw = closer_name.lower()
        items_dict = [i for i in items_dict if kw in (i.get("closer_name") or "").lower() or any(kw in (c.get("name") or "").lower() for c in (i.get("closers") or []))]
    items_dict.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    customer_access_service.require_transaction_access(request, detail=True)
    return customer_access_service.filter_customer_search_results(
        request, oh_card_reading_service.search_customers(q)
    )


@router.get("/{reading_id}")
def get_reading(reading_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    reading = oh_card_reading_service.get_reading(reading_id)
    if not reading:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, reading.customer_id)
    return reading.model_dump() if hasattr(reading, "model_dump") else reading


@router.post("")
def create_reading(data: OhCardReadingCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    ensure_payment_closer_total(data, "amount", request=request)
    return oh_card_reading_service.create_reading(stamp_payment_creator(data, request))


@router.patch("/{reading_id}")
def update_reading(reading_id: str, data: dict, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = oh_card_reading_service.get_reading(reading_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    ensure_payment_record_manager(request, existing)
    data.pop("created_by", None)
    data.pop("created_by_id", None)
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    if data.get("customer_id") and data["customer_id"] != existing.customer_id:
        customer_access_service.require_customer_scope(request, data["customer_id"], action="新增付费项目到")
    ensure_payment_closer_total(data, "amount", existing, request)
    # diagnosis_duration 必须是正整数
    if "diagnosis_duration" in data:
        dd = data["diagnosis_duration"]
        if isinstance(dd, bool) or not isinstance(dd, (int, float)) or dd < 1 or int(dd) != dd:
            raise HTTPException(status_code=400, detail="诊断时长必须是正整数")
        data["diagnosis_duration"] = int(dd)
    reading = oh_card_reading_service.update_reading(reading_id, data)
    if not reading:
        raise HTTPException(status_code=404, detail="记录不存在")
    return reading


@router.delete("/{reading_id}")
def delete_reading(reading_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = oh_card_reading_service.get_reading(reading_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    ensure_payment_record_manager(request, existing)
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    success, message = oh_card_reading_service.delete_reading(reading_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}
