from fastapi import APIRouter, HTTPException, Query, Request

from app.models.tea_seat_fee import TeaSeatFeeCreate
from app.services import customer_access_service, tea_seat_fee_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/tea-seat-fees", tags=["tea-seat-fees"])


@router.get("")
def list_fees(request: Request, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = tea_seat_fee_service.list_fees()
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
        request, tea_seat_fee_service.search_customers(q)
    )


@router.get("/{fee_id}")
def get_fee(fee_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    fee = tea_seat_fee_service.get_fee(fee_id)
    if not fee:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, fee.customer_id)
    return fee.model_dump() if hasattr(fee, "model_dump") else fee


@router.post("")
def create_fee(data: TeaSeatFeeCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    return tea_seat_fee_service.create_fee(data)


@router.patch("/{fee_id}")
def update_fee(fee_id: str, data: dict, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = tea_seat_fee_service.get_fee(fee_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    if data.get("customer_id") and data["customer_id"] != existing.customer_id:
        customer_access_service.require_customer_scope(request, data["customer_id"], action="新增付费项目到")
    fee = tea_seat_fee_service.update_fee(fee_id, data)
    if not fee:
        raise HTTPException(status_code=404, detail="记录不存在")
    return fee


@router.delete("/{fee_id}")
def delete_fee(fee_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = tea_seat_fee_service.get_fee(fee_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    success, message = tea_seat_fee_service.delete_fee(fee_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}
