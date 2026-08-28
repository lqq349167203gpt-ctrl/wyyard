from fastapi import APIRouter, HTTPException, Query, Request

from app.models.group_case import GroupCaseCreate
from app.services import customer_access_service, group_case_service, group_case_session_service
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/group-cases", tags=["group-cases"])


@router.get("")
def list_cases(request: Request, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    customer_access_service.require_transaction_access(request, detail=True)
    items = group_case_service.list_cases()
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
        item["effective_remaining"] = group_case_session_service.get_purchase_remaining(item.get("id", ""))
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    customer_access_service.require_transaction_access(request, detail=True)
    return customer_access_service.filter_customer_search_results(
        request, group_case_service.search_customers(q)
    )


@router.get("/{case_id}")
def get_case(case_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    case = group_case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, case.customer_id)
    result = case.model_dump() if hasattr(case, "model_dump") else case
    result["effective_remaining"] = group_case_session_service.get_purchase_remaining(case_id)
    return result


@router.post("")
def create_case(data: GroupCaseCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    return group_case_service.create_case(data)


@router.patch("/{case_id}")
def update_case(case_id: str, data: dict, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = group_case_service.get_case(case_id)
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
    case = group_case_service.update_case(case_id, data)
    if not case:
        raise HTTPException(status_code=404, detail="记录不存在")
    return case


@router.delete("/{case_id}")
def delete_case(case_id: str, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    existing = group_case_service.get_case(case_id)
    if not existing:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, existing.customer_id, action="删除")
    success, message = group_case_service.delete_case(case_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}
