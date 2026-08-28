from fastapi import APIRouter, HTTPException, Query, Request

from app.models.energy_knot import EnergyKnotCreate
from app.services import customer_access_service, energy_knot_service, energy_knot_session_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/energy-knots", tags=["energy-knots"])


@router.get("")
def list_knots(request: Request, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = energy_knot_service.list_knots()
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
    # 每张卡独立计算剩余（优先扣最早到期）
    for item in items_dict:
        item["effective_remaining"] = energy_knot_session_service.get_purchase_remaining(item.get("id", ""))
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    customer_access_service.require_transaction_access(request, detail=True)
    return customer_access_service.filter_customer_search_results(
        request, energy_knot_service.search_customers(q)
    )


@router.get("/{knot_id}")
def get_knot(knot_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    knot = energy_knot_service.get_knot(knot_id)
    if not knot:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, knot.customer_id)
    result = knot.model_dump() if hasattr(knot, "model_dump") else knot
    result["effective_remaining"] = energy_knot_session_service.get_purchase_remaining(knot_id)
    return result


@router.post("")
def create_knot(data: EnergyKnotCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    return energy_knot_service.create_knot(data)


@router.patch("/{knot_id}")
def update_knot(knot_id: str, data: dict, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = energy_knot_service.get_knot(knot_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="修改")
    if data.get("customer_id") and data["customer_id"] != existing.customer_id:
        customer_access_service.require_customer_scope(request, data["customer_id"], action="新增付费项目到")
    # purchase_count 允许修正：剩余次数由「购买 - 已使用 - 销卡」实时派生，修改总数不破坏恒等式
    if "purchase_count" in data:
        pc = data["purchase_count"]
        if isinstance(pc, bool) or not isinstance(pc, (int, float)) or pc < 0 or int(pc) != pc:
            raise HTTPException(status_code=400, detail="购买次数必须是非负整数")
        data["purchase_count"] = int(pc)
    knot = energy_knot_service.update_knot(knot_id, data)
    if not knot:
        raise HTTPException(status_code=404, detail="记录不存在")
    return knot


@router.delete("/{knot_id}")
def delete_knot(knot_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = energy_knot_service.get_knot(knot_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    success, message = energy_knot_service.delete_knot(knot_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}
