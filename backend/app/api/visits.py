from fastapi import APIRouter, HTTPException, Query

from app.models.visit import VisitRecordCreate
from app.services import visit_service
from app.services import customer_service
from app.services.customer_service import get_customer
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/visits", tags=["visits"])


def _fill_member_type(record):
    """从客户信息实时填充会员身份和昵称"""
    data = record.model_dump(mode="json")
    customer = get_customer(record.customer_id)
    data["member_type"] = customer.member_type if customer else ""
    data["nickname"] = customer.nickname if customer else ""
    return data


@router.get("")
async def list_visits(
    date: str = None,
    customer_id: str = None,
    space_id: str = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    records = visit_service.list_visits(date, customer_id, space_id)
    items = [_fill_member_type(r) for r in records]
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.get("/light")
async def list_visits_light(
    date: str = None,
    space_id: str = None,
):
    """轻量版列表，不计算活动详情，适用于主页快速加载"""
    try:
        return visit_service.list_visits_light(date, space_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/counts")
async def get_visit_counts(
    customer_ids: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    member_types: str | None = Query(None),
    space_id: str | None = Query(None),
):
    """返回各日期的到场人数统计 {date: count}，不做活动计数。支持 member_types 过滤权限"""
    ids = None
    if member_types is not None:
        types = [m for m in member_types.split(",") if m]
        if types:
            customers = customer_service.list_customers()
            ids = [c.id for c in customers if c.member_type in types]
            if not ids:
                return {}
        else:
            ids = None  # member_types 参数为空 → 超管，不过滤
    elif customer_ids is not None:
        ids = [x for x in customer_ids.split(",") if x]
        if not ids:
            return {}
    return visit_service.get_date_counts(ids, start_date, end_date, space_id)


@router.get("/search-customers")
async def search_customers(q: str = ""):
    return visit_service.search_customers(q)


@router.post("/reorder")
async def reorder_visits(data: dict):
    """批量更新排序权重。传入 {"ids": ["id1", "id2", ...]} 按顺序设置 sort_order"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    visit_service.reorder_visits(ids)
    return {"message": "排序已更新"}


@router.get("/{visit_id}")
async def get_visit(visit_id: str):
    record = visit_service.get_visit(visit_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return _fill_member_type(record)


@router.post("")
async def create_visit(data: VisitRecordCreate):
    try:
        record = visit_service.create_visit(data)
        return _fill_member_type(record)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{visit_id}")
async def update_visit(visit_id: str, data: dict):
    record = visit_service.update_visit(visit_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return _fill_member_type(record)


@router.delete("/{visit_id}")
async def delete_visit(visit_id: str):
    if not visit_service.delete_visit(visit_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
