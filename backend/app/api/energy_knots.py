from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import energy_knot_service, energy_knot_session_service
from app.models.energy_knot import EnergyKnotCreate

router = APIRouter(prefix="/api/energy-knots", tags=["energy-knots"])


@router.get("")
def list_knots(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    items = energy_knot_service.list_knots()
    items_dict = [i.model_dump() if hasattr(i, "model_dump") else i for i in items]
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
    remaining_cache: dict[str, int] = {}
    for item in items_dict:
        cid = item.get("customer_id", "")
        if cid not in remaining_cache:
            remaining_cache[cid] = energy_knot_session_service.get_remaining_count(cid)
        item["effective_remaining"] = remaining_cache[cid]
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.get("/search-customers")
def search_customers(q: str = ""):
    return energy_knot_service.search_customers(q)


@router.get("/{knot_id}")
def get_knot(knot_id: str):
    knot = energy_knot_service.get_knot(knot_id)
    if not knot:
        raise HTTPException(status_code=404, detail="记录不存在")
    result = knot.model_dump() if hasattr(knot, "model_dump") else knot
    result["effective_remaining"] = energy_knot_session_service.get_remaining_count(knot.customer_id)
    return result


@router.post("")
def create_knot(data: EnergyKnotCreate):
    return energy_knot_service.create_knot(data)


@router.patch("/{knot_id}")
def update_knot(knot_id: str, data: dict):
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
def delete_knot(knot_id: str):
    success, message = energy_knot_service.delete_knot(knot_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}
