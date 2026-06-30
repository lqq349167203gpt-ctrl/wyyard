from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from pydantic import BaseModel

from app.models.customer import CustomerCreate, CustomerUpdate, ChatLogParseRequest
from app.services import (
    customer_service,
    membership_card_service,
    group_case_service,
    emotional_release_service,
    energy_knot_service,
    internal_course_service,
    oh_card_reading_service,
    other_project_service,
)
from app.services.visit_service import count_customer_visits, get_last_visit_date
from app.services.chat_parser import parse_chat_log, generate_tags
from app.services.excel_parser import parse_excel
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/customers", tags=["customers"])


class TagsGenerateRequest(BaseModel):
    tags: str


def _build_payment_map() -> dict[str, int]:
    """预计算所有客户的消费总额（O(N) 复杂度）"""
    from collections import defaultdict
    totals: dict[str, int] = defaultdict(int)
    for c in membership_card_service.list_cards():
        if not c.voided:
            totals[c.customer_id] += c.price
    for c in group_case_service.list_cases():
        totals[c.customer_id] += c.amount
    for r in emotional_release_service.list_releases():
        totals[r.customer_id] += r.amount
    for k in energy_knot_service.list_knots():
        totals[k.customer_id] += k.amount
    for c in internal_course_service.list_courses():
        totals[c.customer_id] += c.price
    for r in oh_card_reading_service.list_readings():
        totals[r.customer_id] += r.amount
    for p in other_project_service.list_projects():
        totals[p.customer_id] += p.fee
    return totals


def _fill_visit_count(customer, payment_map: dict[str, int] | None = None):
    """填充历史到场次数、消费总额、最近到店日期"""
    data = customer.model_dump(mode="json")
    data["visit_count"] = count_customer_visits(customer.id)
    if payment_map is not None:
        data["total_payment"] = payment_map.get(customer.id, 0)
    else:
        data["total_payment"] = _build_payment_map().get(customer.id, 0)
    data["last_visit_date"] = get_last_visit_date(customer.id)
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
    payment_map = _build_payment_map()
    items = [_fill_visit_count(c, payment_map) for c in customers]

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
async def create_customer(data: CustomerCreate, request: Request):
    # 自动填充创建人
    if not data.created_by:
        account_id = ""
        # 优先从 X-User-Id 获取（管理端）
        user_id = request.headers.get("X-User-Id", "")
        if user_id:
            account_id = user_id
        else:
            # 从 Authorization: Bearer <token> 获取（小程序端）
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
                try:
                    from app.services.wechat_service import validate_token
                    account_id = validate_token(token) or ""
                except Exception:
                    pass
        if account_id:
            try:
                from app.services import account_service
                account = account_service.get_account(account_id)
                if account:
                    data.created_by = account.owner or account.username
            except Exception:
                pass
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
