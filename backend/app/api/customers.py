from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel

from app.models.customer import CustomerCreate, CustomerUpdate, ChatLogParseRequest
from app.services import (
    customer_service,
    membership_card_service,
    group_case_service,
    emotional_release_service,
    energy_knot_service,
)
from app.services.visit_service import count_customer_visits
from app.services.chat_parser import parse_chat_log, generate_tags
from app.services.excel_parser import parse_excel
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/customers", tags=["customers"])


class TagsGenerateRequest(BaseModel):
    tags: str


def _fill_total_payment(customer_id: str) -> int:
    """计算客户消费总额"""
    total = 0
    for c in membership_card_service.list_cards():
        if c.customer_id == customer_id:
            total += c.price
    for c in group_case_service.list_cases():
        if c.customer_id == customer_id:
            total += c.amount
    for r in emotional_release_service.list_releases():
        if r.customer_id == customer_id:
            total += r.amount
    for k in energy_knot_service.list_knots():
        if k.customer_id == customer_id:
            total += k.amount
    return total


def _fill_visit_count(customer):
    """填充历史到场次数和消费总额"""
    data = customer.model_dump(mode="json")
    data["visit_count"] = count_customer_visits(customer.id)
    data["total_payment"] = _fill_total_payment(customer.id)
    return data


@router.get("")
async def list_customers(
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
    nickname: str | None = Query(None),
    member_type: str | None = Query(None),
    referrer: str | None = Query(None),
    referrer_handler: str | None = Query(None),
    member_types: str | None = Query(None),
):
    customers = customer_service.list_customers()
    items = [_fill_visit_count(c) for c in customers]

    # Apply filters
    if nickname:
        items = [c for c in items if nickname.lower() in (c.get("nickname", "") or "").lower()]
    if member_type:
        items = [c for c in items if c.get("member_type") == member_type]
    if referrer:
        items = [c for c in items if referrer.lower() in (c.get("referrer", "") or "").lower()]
    if referrer_handler:
        items = [c for c in items if referrer_handler.lower() in (c.get("referrer_handler", "") or "").lower()]
    if member_types:
        allowed = [m.strip() for m in member_types.split(",") if m.strip()]
        if allowed:
            items = [c for c in items if c.get("member_type") in allowed]

    # Sort by created_at descending
    items.sort(key=lambda c: c.get("created_at", ""), reverse=True)

    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
async def create_customer(data: CustomerCreate):
    try:
        customer = customer_service.create_customer(data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _fill_visit_count(customer)


class BatchRequest(BaseModel):
    ids: list[str]


@router.get("/light")
async def list_customers_light():
    """轻量端点：只返回常用字段，供人员到场/引流记录等页面使用"""
    customers = customer_service.list_customers()
    return [
        {
            "id": c.id,
            "nickname": c.nickname,
            "name": c.name or "",
            "member_type": c.member_type or "",
            "positions": c.positions or [],
            "created_at": c.created_at.isoformat() if c.created_at else "",
            "traffic_source": c.traffic_source or "",
            "traffic_source_detail": c.traffic_source_detail or "",
            "referrer": c.referrer or "",
            "position_sort_orders": c.position_sort_orders or {},
            "space_id": c.space_id or "",
        }
        for c in customers
    ]


@router.post("/batch")
async def batch_customers(data: BatchRequest):
    """批量获取客户信息，只返回 id/nickname/name/member_type/positions"""
    id_set = set(data.ids)
    customers = customer_service.list_customers()
    return [
        {
            "id": c.id,
            "nickname": c.nickname,
            "name": c.name or "",
            "member_type": c.member_type or "",
            "positions": c.positions or [],
            "space_id": c.space_id or "",
        }
        for c in customers
        if c.id in id_set
    ]


@router.get("/{customer_id}")
async def get_customer(customer_id: str):
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    return _fill_visit_count(customer)


@router.patch("/{customer_id}")
async def update_customer(customer_id: str, data: CustomerUpdate):
    try:
        customer = customer_service.update_customer(customer_id, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    return _fill_visit_count(customer)


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str):
    if not customer_service.delete_customer(customer_id):
        raise HTTPException(status_code=404, detail="客户不存在")
    return {"message": "已删除"}


@router.post("/parse-chat")
async def parse_chat(data: ChatLogParseRequest):
    try:
        result = parse_chat_log(data.chat_log)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


@router.post("/parse-excel")
async def parse_excel_file(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="请上传 Excel 文件（.xlsx 或 .xls）")
    try:
        content = await file.read()
        results = parse_excel(content)
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


@router.post("/generate-tags")
async def generate_tags_endpoint(data: TagsGenerateRequest):
    try:
        result = generate_tags(data.tags)
        return {"tags": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")
