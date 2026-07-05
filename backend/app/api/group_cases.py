from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import group_case_service, group_case_session_service
from app.models.group_case import GroupCaseCreate

router = APIRouter(prefix="/api/group-cases", tags=["group-cases"])


@router.get("")
def list_cases(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    items = group_case_service.list_cases()
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
    # 计算每个客户的剩余次数
    remaining_cache: dict[str, int] = {}
    for item in items_dict:
        cid = item.get("customer_id", "")
        if cid not in remaining_cache:
            remaining_cache[cid] = group_case_session_service.get_remaining_count(cid)
        item["effective_remaining"] = remaining_cache[cid]
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


@router.get("/{case_id}")
def get_case(case_id: str):
    case = group_case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="记录不存在")
    result = case.model_dump() if hasattr(case, "model_dump") else case
    result["effective_remaining"] = group_case_session_service.get_remaining_count(case.customer_id)
    return result


@router.post("")
def create_case(data: GroupCaseCreate):
    return group_case_service.create_case(data)


@router.patch("/{case_id}")
def update_case(case_id: str, data: dict):
    # purchase_count 是总购买次数，创建时定，禁止外部 PATCH 修改（防止绕过活动扣减恒等式）
    if "purchase_count" in data:
        raise HTTPException(
            status_code=400,
            detail="不允许直接修改总购买次数。请通过新增购买记录或销卡流水操作。",
        )
    case = group_case_service.update_case(case_id, data)
    if not case:
        raise HTTPException(status_code=404, detail="记录不存在")
    return case


@router.delete("/{case_id}")
def delete_case(case_id: str):
    success, message = group_case_service.delete_case(case_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return group_case_service.search_customers(q)
