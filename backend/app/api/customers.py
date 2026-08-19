import logging
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import Field
from starlette.requests import Request as StarletteRequest

from app.middleware.jwt_auth import require_admin
from app.middleware.rate_limit import limiter
from app.models.base import StrictBaseModel
from app.models.customer import ChatLogParseRequest, CustomerCreate, CustomerUpdate
from app.services import (
    customer_service,
    customer_tag_service,
    emotional_release_service,
    energy_knot_service,
    group_case_service,
    internal_course_service,
    member_identity_service,
    membership_card_service,
    oh_card_reading_service,
    other_project_service,
    project_refund_service,
    tea_seat_fee_service,
)
from app.services.chat_parser import generate_tags, parse_chat_log
from app.services.excel_parser import parse_excel
from app.services.visit_service import _count_customer_activities, count_customer_visits, get_last_visit_date
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customers", tags=["customers"])


class TagsGenerateRequest(StrictBaseModel):
    tags: str


class BatchRequest(StrictBaseModel):
    ids: list[str] = Field(max_length=500)


def _fill_total_payment(customer_id: str) -> float:
    """计算客户净消费总额 = 所有项目付款 - 所有退款（排除已作废的会员卡）"""
    total = 0.0
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
    for c in internal_course_service.list_courses():
        if c.customer_id == customer_id:
            total += c.price
    for r in oh_card_reading_service.list_readings():
        if r.customer_id == customer_id:
            total += r.amount
    for t in tea_seat_fee_service.list_fees():
        if t.customer_id == customer_id:
            total += t.amount
    for p in other_project_service.list_projects():
        if p.customer_id == customer_id:
            total += p.fee
    # 扣除退款金额
    for r in project_refund_service.list_refunds(customer_id=customer_id):
        total -= r.refund_amount
    return max(total, 0)


def _build_enriched_items(customers) -> list[dict]:
    """批量构建客户列表，一次性扫描所有项目，避免 N*7 次全表扫描"""
    from collections import defaultdict

    payment_map: dict[str, float] = defaultdict(float)

    # 会员卡（作废卡仍计入消费总额，退费由 refund 记录扣除）
    for c in membership_card_service.list_cards():
        payment_map[c.customer_id] += c.price
    # 觉醒游戏
    for c in group_case_service.list_cases():
        payment_map[c.customer_id] += c.amount
    # 情绪释放
    for r in emotional_release_service.list_releases():
        payment_map[r.customer_id] += r.amount
    # 能量结
    for k in energy_knot_service.list_knots():
        payment_map[k.customer_id] += k.amount
    # 内部课程
    for c in internal_course_service.list_courses():
        payment_map[c.customer_id] += c.price
    # OH卡诊断
    for r in oh_card_reading_service.list_readings():
        payment_map[r.customer_id] += r.amount
    # 茶位费
    for t in tea_seat_fee_service.list_fees():
        payment_map[t.customer_id] += t.amount
    # 其他项目
    for p in other_project_service.list_projects():
        payment_map[p.customer_id] += p.fee
    # 扣除退款
    for r in project_refund_service.list_refunds():
        payment_map[r.customer_id] -= r.refund_amount

    _SLIM_FIELDS = (
        "id", "nickname", "name", "gender", "phone", "wechat", "age",
        "member_type", "positions", "self_tags", "paid_content",
        "referrer", "referral_date", "referrer_handler", "service_teacher",
        "follow_up_status",
        "traffic_source", "traffic_source_detail",
        "need_tags", "follow_up_node", "follow_up_action",
        "core_situation", "tags", "work_status", "work_description",
        "basic_info", "assessment", "other_info", "tracking_plan",
        "created_at", "created_by", "space_id", "position_sort_orders",
    )
    remaining_map = membership_card_service.list_current_card_remaining({c.id for c in customers})
    items = []
    for c in customers:
        data = {k: getattr(c, k, None) for k in _SLIM_FIELDS}
        data["visit_count"] = count_customer_visits(c.id)
        data["activity_count"] = _count_customer_activities(c.id)
        data["total_payment"] = max(payment_map.get(c.id, 0), 0)
        data["last_visit_date"] = get_last_visit_date(c.id)
        data["card_remaining"] = remaining_map.get(c.id)
        items.append(data)
    return items


def _fill_visit_count(customer):
    """填充历史到场次数、消费总额、最近到店日期（单个客户，用于详情）"""
    data = customer.model_dump(mode="json")
    data["visit_count"] = count_customer_visits(customer.id)
    data["total_payment"] = _fill_total_payment(customer.id)
    data["last_visit_date"] = get_last_visit_date(customer.id)
    return data


_SORTABLE_FIELDS = {"member_type", "visit_count", "activity_count", "total_payment", "last_visit_date", "created_at", "referral_date"}
_NUMERIC_SORT_FIELDS = {"visit_count", "activity_count", "total_payment"}


def _sort_customer_items(items: list[dict], sort_by: str, sort_order: str | None) -> None:
    """对完整客户结果集排序；空值始终置底，数值 0 不视为空值。"""
    reverse = sort_order != "asc"
    populated = [item for item in items if item.get(sort_by) not in (None, "")]
    empty = [item for item in items if item.get(sort_by) in (None, "")]

    if sort_by in _NUMERIC_SORT_FIELDS:
        populated.sort(key=lambda item: float(item[sort_by]), reverse=reverse)
    elif sort_by == "member_type":
        identity_order = {
            identity.name: index
            for index, identity in enumerate(member_identity_service.list_identities())
        }
        fallback_order = len(identity_order)
        populated.sort(
            key=lambda item: (
                identity_order.get(str(item[sort_by]), fallback_order),
                str(item[sort_by]).casefold(),
            ),
            reverse=reverse,
        )
    else:
        populated.sort(key=lambda item: str(item[sort_by]), reverse=reverse)

    items[:] = populated + empty


@router.get("")
async def list_customers(
    request: Request,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
    nickname: str | None = Query(None),
    member_type: str | None = Query(None),
    referrer: str | None = Query(None),
    referrer_handler: str | None = Query(None),
    member_types: str | None = Query(None),
    tag_ids: str | None = Query(None),
    tag_match: str = Query("any", pattern="^(any|all)$"),
    referrers: str | None = Query(None),
    last_visit_days_min: int | None = Query(None, ge=0),
    last_visit_days_max: int | None = Query(None, ge=0),
    sort_by: str | None = Query(None),
    sort_order: str | None = Query(None),
):
    customers = customer_service.list_customers()
    items = _build_enriched_items(customers)

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
    if referrers:
        allowed_refs = [r.strip() for r in referrers.split(",") if r.strip()]
        if allowed_refs:
            items = [c for c in items if (c.get("referrer") or "").strip() in allowed_refs]
    if tag_ids:
        requested_tag_ids = [tag_id.strip() for tag_id in tag_ids.split(",") if tag_id.strip()]
        try:
            matched_customer_ids = customer_tag_service.customer_ids_for_tags(
                getattr(request.state, "user_id", ""),
                requested_tag_ids,
                tag_match,
            )
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        items = [item for item in items if item["id"] in matched_customer_ids]
    if last_visit_days_min is not None or last_visit_days_max is not None:
        today = date.today()
        filtered = []
        for c in items:
            d = (c.get("last_visit_date") or "").strip()
            if not d:
                continue
            try:
                days_ago = (today - date.fromisoformat(d)).days
            except ValueError:
                continue
            if last_visit_days_min is not None and days_ago < last_visit_days_min:
                continue
            if last_visit_days_max is not None and days_ago > last_visit_days_max:
                continue
            filtered.append(c)
        items = filtered

    visible_tags = customer_tag_service.visible_tags_by_customer(getattr(request.state, "user_id", ""))
    for item in items:
        item["customer_tags"] = visible_tags.get(item["id"], [])

    # Sort
    if sort_by and sort_by in _SORTABLE_FIELDS:
        _sort_customer_items(items, sort_by, sort_order)
    else:
        items.sort(key=lambda c: c.get("created_at", ""), reverse=True)

    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.post("")
async def create_customer(data: CustomerCreate, request: Request):
    # 强制从 JWT 派生 created_by，忽略客户端传入值
    account_id = getattr(request.state, "user_id", "")
    if account_id:
        try:
            from app.services import account_service
            account = account_service.get_account(account_id)
            if account:
                data.created_by = account.owner or account.username
        except Exception:
            logger.warning("无法从 JWT 派生 created_by: account_id=%s", account_id)
    try:
        customer = customer_service.create_customer(data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _fill_visit_count(customer)


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
            "referral_date": c.referral_date or "",
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


@router.get("/disabled")
async def list_disabled_customers():
    """列出所有已停用的客户"""
    customers = customer_service.list_disabled_customers()
    return [
        {
            "id": c.id,
            "nickname": c.nickname,
            "name": c.name or "",
            "member_type": c.member_type or "",
            "phone": c.phone or "",
            "deleted_at": c.deleted_at.isoformat() if c.deleted_at else "",
            "deleted_by": c.deleted_by or "",
        }
        for c in customers
    ]


@router.get("/{customer_id}")
async def get_customer(customer_id: str):
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    if customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    return _fill_visit_count(customer)


@router.patch("/{customer_id}")
async def update_customer(customer_id: str, data: CustomerUpdate):
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    try:
        customer = customer_service.update_customer(customer_id, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    return _fill_visit_count(customer)


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, request: Request):
    deleted_by = getattr(request.state, "user_name", "") or "未知"
    if not customer_service.delete_customer(customer_id, deleted_by):
        raise HTTPException(status_code=404, detail="客户不存在")
    return {"message": "已停用"}


@router.post("/{customer_id}/restore")
async def restore_customer(customer_id: str, _admin: str = Depends(require_admin)):
    customer = customer_service.restore_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在或未被停用")
    return _fill_visit_count(customer)


@router.delete("/{customer_id}/permanent")
async def permanent_delete_customer(customer_id: str, _admin: str = Depends(require_admin)):
    """彻底删除客户（仅限无关联记录的客户）"""
    ok, error = customer_service.permanent_delete_customer(customer_id)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    return {"message": "已彻底删除"}


@router.post("/cleanup-deleted")
async def cleanup_deleted_customers():
    """清理所有已删除客户在活动记录中的引用"""
    count = customer_service.cleanup_all_deleted_customers()
    return {"message": f"已清理 {count} 个已删除客户的引用"}


@router.post("/parse-chat")
@limiter.limit("10/minute")
async def parse_chat(data: ChatLogParseRequest, request: StarletteRequest):
    # 需要登录
    if not getattr(request.state, "user_id", ""):
        raise HTTPException(status_code=401, detail="请先登录")
    # 输入长度限制
    if len(data.chat_log) > 50000:
        raise HTTPException(status_code=400, detail="聊天记录过长，最多 50000 字符")
    try:
        result = parse_chat_log(data.chat_log)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("聊天记录解析失败")
        raise HTTPException(status_code=500, detail="解析失败，请稍后重试")


@router.post("/parse-excel")
@limiter.limit("10/minute")
async def parse_excel_file(request: StarletteRequest, file: UploadFile = File(...)):
    if not getattr(request.state, "user_id", ""):
        raise HTTPException(status_code=401, detail="请先登录")
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="请上传 Excel 文件（.xlsx 或 .xls）")
    try:
        # 分块读取，提前检查大小，避免超大文件占满内存
        max_size = 10 * 1024 * 1024  # 10MB
        chunks = []
        total = 0
        while True:
            chunk = await file.read(8192)
            if not chunk:
                break
            total += len(chunk)
            if total > max_size:
                raise HTTPException(status_code=400, detail="文件过大，最多 10MB")
            chunks.append(chunk)
        content = b"".join(chunks)
        results = parse_excel(content)
        return results
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Excel 解析失败")
        raise HTTPException(status_code=500, detail="解析失败，请稍后重试")


@router.post("/generate-tags")
@limiter.limit("10/minute")
async def generate_tags_endpoint(data: TagsGenerateRequest, request: StarletteRequest):
    if not getattr(request.state, "user_id", ""):
        raise HTTPException(status_code=401, detail="请先登录")
    if len(data.tags) > 10000:
        raise HTTPException(status_code=400, detail="输入过长，最多 10000 字符")
    try:
        result = generate_tags(data.tags)
        return {"tags": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("标签生成失败")
        raise HTTPException(status_code=500, detail="生成失败，请稍后重试")
