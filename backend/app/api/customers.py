import logging
from datetime import date, datetime
from io import BytesIO
from typing import Literal
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import Field
from starlette.requests import Request as StarletteRequest

from app.middleware.jwt_auth import require_admin, require_page_permission
from app.middleware.rate_limit import limiter
from app.models.base import StrictBaseModel
from app.models.customer import ChatLogParseRequest, CustomerCreate, CustomerQuality, CustomerUpdate, customer_referrers
from app.models.operation_log import OperationLogCreate
from app.services import (
    customer_access_service,
    customer_contact_service,
    customer_export_service,
    customer_service,
    customer_tag_service,
    customer_workspace_service,
    emotional_release_service,
    energy_knot_service,
    follow_up_status_service,
    group_case_service,
    internal_course_service,
    member_identity_service,
    membership_card_service,
    oh_card_reading_service,
    operation_log_service,
    other_project_service,
    project_deduction_service,
    project_refund_service,
    tea_seat_fee_service,
    visit_service,
)
from app.services.chat_parser import generate_tags, parse_chat_log
from app.services.excel_parser import parse_excel
from app.services.visit_service import (
    _count_customer_activities,
    count_customer_visits,
    customer_visit_summary,
    get_last_visit_date,
)
from app.utils.pagination import paginate
from app.utils.request_context import get_client_ip, get_client_source
from app.utils.request_roles import get_request_roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _validate_follow_up_status(value: str | None) -> None:
    if value is not None and value != follow_up_status_service.UNCONFIGURED and not follow_up_status_service.is_active(value):
        raise HTTPException(status_code=422, detail="跟进状态不存在或已停用")


class TagsGenerateRequest(StrictBaseModel):
    tags: str


class BatchRequest(StrictBaseModel):
    ids: list[str] = Field(max_length=500)


class BulkCustomerUpdate(StrictBaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    customer_quality: CustomerQuality | None = None
    service_teacher: str | None = Field(default=None, max_length=50)


class ContactAccessRequest(StrictBaseModel):
    field: Literal["phone", "wechat"]
    action: Literal["view", "copy"]


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


def _build_transaction_counts() -> dict[str, int]:
    """与客户详情交易记录一致：每条交易记一笔，包含零金额及粗门抵扣记录。"""
    from collections import Counter

    from app.services.payment_sources import payment_record_groups

    counts = Counter()
    for records in payment_record_groups():
        counts.update(record.customer_id for record in records)
    counts.update(
        record.customer_id
        for record in project_deduction_service.list_deductions(project_type="membership-cards")
        if record.project_name == project_deduction_service.COARSE_DOOR_CARD_TYPE
    )
    return dict(counts)


def _customer_list_base(customer) -> dict:
    """不查询关联记录，先完成基础筛选与分页。"""
    _SLIM_FIELDS = (
        "id", "nickname", "name", "gender", "phone", "wechat", "age",
        "member_type", "card_status", "card_status_tone", "positions", "self_tags", "paid_content",
        "referrer", "referrers", "referral_date", "referrer_handler", "service_teacher",
        "handoff",
        "follow_up_status",
        "customer_quality",
        "traffic_source", "traffic_source_detail", "traffic_post_name",
        "need_tags", "follow_up_node", "follow_up_action",
        "core_situation", "tags", "work_status", "work_description",
        "income_stability", "personal_annual_income", "household_annual_income",
        "basic_info", "assessment", "other_info", "tracking_plan",
        "created_at", "created_by", "space_id", "position_sort_orders",
    )
    return {key: getattr(customer, key, None) for key in _SLIM_FIELDS}


def _build_payment_totals() -> dict[str, float]:
    """保留历史金额口径；仅需要金额的调用方才计算。"""
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
    # 深度情绪释放
    for k in energy_knot_service.list_knots():
        payment_map[k.customer_id] += k.amount
    # 沙龙技能学习
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

    return payment_map


def _build_enriched_items(customers, *, list_view: bool = False, include_payment: bool = False) -> list[dict]:
    """PC 客户列表不计算未展示的金额和卡次；其他调用方保持原有返回。"""
    transaction_counts = _build_transaction_counts()
    payment_map = _build_payment_totals() if not list_view or include_payment else {}

    remaining_map = membership_card_service.list_current_card_remaining({c.id for c in customers}) if not list_view else {}
    visits = customer_visit_summary({c.id for c in customers})
    items = []
    for c in customers:
        data = _customer_list_base(c)
        data["visit_count"] = visits[c.id][0]
        data["activity_count"] = _count_customer_activities(c.id)
        if not list_view or include_payment:
            data["total_payment"] = max(payment_map.get(c.id, 0), 0)
        data["transaction_count"] = transaction_counts.get(c.id, 0)
        data["last_visit_date"] = visits[c.id][1]
        if not list_view:
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


_SORTABLE_FIELDS = {"member_type", "card_status", "visit_count", "activity_count", "total_payment", "transaction_count", "last_visit_date", "created_at", "referral_date"}
_NUMERIC_SORT_FIELDS = {"visit_count", "activity_count", "total_payment", "transaction_count"}


def _sort_customer_items(items: list[dict], sort_by: str, sort_order: str | None) -> None:
    """对完整客户结果集排序；空值始终置底，数值 0 不视为空值。"""
    reverse = sort_order != "asc"
    populated = [item for item in items if item.get(sort_by) not in (None, "")]
    empty = [item for item in items if item.get(sort_by) in (None, "")]

    if sort_by in _NUMERIC_SORT_FIELDS:
        populated.sort(key=lambda item: float(item[sort_by]), reverse=reverse)
    elif sort_by in {"member_type", "card_status"}:
        identities = (member_identity_service.list_identities("card_status") if sort_by == "card_status"
                      else member_identity_service.list_identities())
        identity_order = {
            identity.name: index
            for index, identity in enumerate(identities)
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
    service_teacher: str | None = Query(None),
    customer_quality: CustomerQuality | None = Query(None),
    member_types: str | None = Query(None),
    card_status: str | None = Query(None),
    card_statuses: str | None = Query(None),
    tag_ids: str | None = Query(None),
    tag_match: str = Query("any", pattern="^(any|all)$"),
    referrers: str | None = Query(None),
    last_visit_days_min: int | None = Query(None, ge=0),
    last_visit_days_max: int | None = Query(None, ge=0),
    sort_by: str | None = Query(None),
    sort_order: str | None = Query(None),
    list_view: bool = Query(False),
    workspace: Literal["all", "referral", "handoff", "sales"] | None = None,
    workspace_owner: str | None = None,
    handoff_status: Literal["pending", "accepted", "history", "all"] = "pending",
):
    customers = customer_access_service.filter_customers(request, customer_service.list_customers())
    customers = customer_workspace_service.filter_workspace(request, customers, workspace, handoff_status, workspace_owner)
    customers_by_id = {customer.id: customer for customer in customers}
    items = [_customer_list_base(customer) for customer in customers]

    # Apply filters
    if nickname:
        keyword = nickname.lower()
        items = [
            customer
            for customer in items
            if keyword in (customer.get("nickname", "") or "").lower()
            or keyword in (customer.get("name", "") or "").lower()
        ]
    if member_type:
        items = [c for c in items if c.get("member_type") == member_type]
    if card_status:
        items = [c for c in items if c.get("card_status") == card_status]
    if card_statuses:
        allowed_statuses = {value.strip() for value in card_statuses.split(",") if value.strip()}
        items = [c for c in items if c.get("card_status") in allowed_statuses]
    if referrer:
        items = [c for c in items if referrer.lower() in (c.get("referrer", "") or "").lower()]
    if referrer_handler:
        items = [c for c in items if referrer_handler.lower() in (c.get("referrer_handler", "") or "").lower()]
    if service_teacher:
        items = [c for c in items if service_teacher.lower() in (c.get("service_teacher", "") or "").lower()]
    if customer_quality:
        items = [c for c in items if c.get("customer_quality", "正常") == customer_quality]
    if member_types:
        allowed = [m.strip() for m in member_types.split(",") if m.strip()]
        if allowed:
            items = [c for c in items if c.get("member_type") in allowed]
    if referrers:
        allowed_refs = [r.strip() for r in referrers.split(",") if r.strip()]
        if allowed_refs:
            items = [c for c in items if set(customer_referrers(c)).intersection(allowed_refs)]
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
    needs_enrichment_for_sort = sort_by in {"visit_count", "activity_count", "total_payment", "transaction_count", "last_visit_date"}
    enrichment_options = {"list_view": True, "include_payment": sort_by == "total_payment"} if list_view else {}
    if needs_enrichment_for_sort:
        items = _build_enriched_items([customers_by_id[item["id"]] for item in items], **enrichment_options)
    if last_visit_days_min is not None or last_visit_days_max is not None:
        if not needs_enrichment_for_sort:
            visit_summary = customer_visit_summary({item["id"] for item in items})
            for item in items:
                item["last_visit_date"] = visit_summary[item["id"]][1]
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
    role = get_request_roles(request)
    can_view_payment = customer_access_service.can_view_transaction_summary(role)
    if sort_by and sort_by in _SORTABLE_FIELDS and (sort_by not in {"total_payment", "transaction_count"} or can_view_payment):
        _sort_customer_items(items, sort_by, sort_order)
    else:
        items.sort(key=lambda c: c.get("created_at", ""), reverse=True)

    if workspace == "handoff":
        items.sort(key=lambda item: (customers_by_id[item["id"]].handoff.assigned_at
                   if customers_by_id[item["id"]].handoff else customers_by_id[item["id"]].created_at), reverse=True)

    # 默认列表先分页再补统计；按统计字段排序时仍先算整批，保证跨页排序正确。
    paginated = paginate(items, page, page_size or 10) if page is not None else None
    if paginated is not None:
        items = paginated["items"]
    if not needs_enrichment_for_sort:
        items = _build_enriched_items([customers_by_id[item["id"]] for item in items], **enrichment_options)
        for item in items:
            item["customer_tags"] = visible_tags.get(item["id"], [])

    protected_items = []
    for item in items:
        protected = customer_access_service.protect_sensitive_data(item, role)
        protected["can_accept_handoff"] = workspace == "handoff" and customer_workspace_service.is_handler(request, customers_by_id[item["id"]])
        if not can_view_payment:
            protected["total_payment"] = None
            protected["transaction_count"] = None
        protected_items.append(customer_contact_service.protect_customer_data(protected, role))
    items = protected_items

    if paginated is not None:
        return {**paginated, "items": items}
    return items


@router.get("/workspaces", dependencies=[Depends(require_page_permission("healing-records"))])
def customer_workspaces(request: Request):
    return customer_workspace_service.available_workspaces(request)


class WorkspaceSettingsUpdate(StrictBaseModel):
    visible_workspaces: list[Literal["all", "referral", "handoff", "sales"]] = Field(min_length=1, max_length=4)
    default_workspace: Literal["all", "referral", "handoff", "sales"]


@router.get("/workspace-settings", dependencies=[Depends(require_page_permission("healing-records"))])
def get_workspace_settings(request: Request):
    return customer_workspace_service.workspace_settings(request)


@router.put("/workspace-settings", dependencies=[Depends(require_page_permission("healing-records"))])
def set_workspace_settings(data: WorkspaceSettingsUpdate, request: Request):
    result = customer_workspace_service.save_workspace_settings(request, data.visible_workspaces, data.default_workspace)
    request.state.operation_log_context = {"content": "修改本人客户界面显示偏好"}
    return result


@router.get("/assignment-options", dependencies=[Depends(require_page_permission("healing-records"))])
async def customer_assignment_options(request: Request):
    """保留可见客户选项，另补业务人员姓名，不泄露其联系方式或客户档案。"""
    from app.services import account_service, position_edit_permission_service

    result = await list_customers_light(request, purpose="selector")
    names = {item["nickname"] for item in result}
    for account in account_service.list_accounts():
        if not account.enabled or not account.owner or account.owner in names:
            continue
        permissions = position_edit_permission_service.get_permissions(account.roles or [account.role])
        if not permissions.get("customer_workspaces"):
            continue
        names.add(account.owner)
        result.append({
            "id": f"staff:{account.id}", "nickname": account.owner, "name": "",
            "member_type": "", "positions": [], "position_sort_orders": {},
            "created_at": "", "traffic_source": "", "traffic_source_detail": "",
            "referrer": "", "referral_date": "", "space_id": "",
        })
    return result


class AcceptHandoffRequest(StrictBaseModel):
    assignment_id: str = Field(min_length=1, max_length=100)


@router.post("/{customer_id}/accept-handoff", dependencies=[Depends(require_page_permission("healing-records"))])
def accept_customer_handoff(customer_id: str, data: AcceptHandoffRequest, request: Request):
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(404, "客户不存在")
    if not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(403, "没有查看该客户的权限")
    if not customer_workspace_service.filter_workspace(request, [customer], "handoff", "all"):
        raise HTTPException(403, "只能确认分配给自己的客户")
    try:
        customer = customer_service.accept_handoff(
            customer_id, data.assignment_id, account_id=getattr(request.state, "user_id", ""),
            owner=customer_access_service.actor_name(request),
        )
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    request.state.operation_log_context = {
        "content": f"确认承接客户“{customer.nickname or customer.name}”", "entity_id": customer.id,
    }
    return {"handoff": customer.handoff}


@router.get("/export-options", dependencies=[Depends(require_page_permission("healing-records"))])
def customer_export_options(request: Request):
    return customer_export_service.available_columns(get_request_roles(request))


@router.get("/export", dependencies=[Depends(require_page_permission("healing-records"))])
def export_customers(
    request: Request,
    card_statuses: list[str] | None = Query(None),
    member_types: list[str] | None = Query(None),
    service_teachers: list[str] | None = Query(None),
    referrers: list[str] | None = Query(None),
    referrer_handlers: list[str] | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    columns: list[str] | None = Query(None),
    workspace: Literal["all", "referral", "handoff", "sales"] | None = None,
    workspace_owner: str | None = None,
    handoff_status: Literal["pending", "accepted", "history", "all"] = "pending",
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "引流开始日期不能晚于结束日期")
    filters = {key: list(dict.fromkeys(value.strip() for value in values or [] if value.strip()))
               for key, values in (("card_statuses", card_statuses), ("member_types", member_types),
                                   ("service_teachers", service_teachers), ("referrers", referrers),
                                   ("referrer_handlers", referrer_handlers))}
    visible = customer_access_service.filter_customers(request, customer_service.list_customers())
    visible = customer_workspace_service.filter_workspace(request, visible, workspace, handoff_status, workspace_owner)
    matched = customer_export_service.select_customers(visible, **filters, date_from=date_from, date_to=date_to)
    if not matched:
        raise HTTPException(400, "没有符合条件的客户，请调整筛选条件")
    roles = get_request_roles(request)
    available = customer_export_service.available_columns(roles)
    allowed = {column["key"]: column for column in available}
    selected = list(dict.fromkeys(columns)) if columns is not None else [column["key"] for column in available if column["default"]]
    if not selected or any(not key for key in selected):
        raise HTTPException(422, "请至少选择一项导出信息")
    if any(key not in allowed for key in selected):
        raise HTTPException(403, "没有导出所选信息的权限，请重新打开导出窗口")
    selected_columns = [allowed[key] for key in selected]
    items = _build_enriched_items(matched, list_view=True)
    visible_tags = customer_tag_service.visible_tags_by_customer(getattr(request.state, "user_id", ""))
    for item in items:
        item["customer_tags"] = visible_tags.get(item["id"], [])
    from app.api.customer_detail import get_customer_detail
    from app.services import communication_record_service
    communications = communication_record_service.list_records() if "communication_records" in selected else []
    customer_export_service.prepare_items(
        matched, items, selected_columns, roles,
        lambda customer_id, section: get_customer_detail(customer_id, request, section=section), communications,
    )
    content = customer_export_service.build_workbook(items, columns=selected_columns)
    labels = {"card_statuses": "卡次状态", "member_types": "会员身份", "service_teachers": "Sales",
              "referrers": "引流人", "referrer_handlers": "承接人"}
    summary = {labels[key]: "、".join(values) for key, values in filters.items() if values}
    if workspace:
        summary["客户视图"] = customer_workspace_service.ADMIN_WORKSPACES.get(workspace, workspace)
        if workspace_owner:
            summary["负责人"] = workspace_owner
    if date_from or date_to:
        summary["引流日期"] = f"{date_from or '不限'} 至 {date_to or '不限'}"
    description = "；".join(f"{key}：{value}" for key, value in summary.items()) or "全部客户"
    operation_log_service.create_log(
        OperationLogCreate(section="客户资料", content=f"导出客户资料，共{len(items)}位；{description}"),
        extra={"operator": customer_access_service.actor_name(request), "operator_role": "、".join(roles),
               "source": get_client_source(request), "method": "EXPORT", "path": request.url.path,
               "ip": get_client_ip(request), "after_data": {"筛选条件": summary, "客户数": len(items),
               "导出信息": [column["label"] for column in selected_columns]}},
    )
    filename = f"客户资料_{datetime.now(ZoneInfo('Asia/Shanghai')).date()}.xlsx"
    return StreamingResponse(BytesIO(content), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"})


@router.post("")
async def create_customer(data: CustomerCreate, request: Request):
    _validate_follow_up_status(data.follow_up_status)
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
        customer = customer_service.create_customer(data, actor_id=account_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    # 新建响应可回显刚刚由当前操作者录入的内容；后续查询仍统一脱敏。
    result = _fill_visit_count(customer)
    result["contact_permissions"] = customer_contact_service.get_role_permissions(
        get_request_roles(request)
    )
    return result


@router.get("/light")
async def list_customers_light(request: Request, purpose: Literal['full', 'selector'] = 'full',
                               workspace: Literal['all', 'referral', 'handoff', 'sales'] | None = None,
                               workspace_owner: str | None = None,
                               handoff_status: Literal['pending', 'accepted', 'history', 'all'] = 'pending'):
    """轻量端点：只返回常用字段，供人员到场/引流记录等页面使用"""
    customers = customer_access_service.filter_customers(request, customer_service.list_customers())
    customers = customer_workspace_service.filter_workspace(request, customers, workspace, handoff_status, workspace_owner)
    visit_days: dict[str, set[str]] = {}
    visits = visit_service.list_basic_visits({c.id for c in customers}) if purpose == 'full' else []
    for visit in visits:
        if visit.arrived:
            visit_days.setdefault(visit.customer_id, set()).add(visit.visit_date)
    return [
        {
            "id": c.id,
            "nickname": c.nickname,
            "name": c.name or "",
            "gender": c.gender or "",
            "member_type": c.member_type or "", "card_status": getattr(c, "card_status", ""), "card_status_tone": getattr(c, "card_status_tone", "neutral"),
            **({"visit_count": len(visit_days.get(c.id, set()))} if purpose == 'full' else {}),
            "positions": c.positions or [],
            "created_at": c.created_at.isoformat() if c.created_at else "",
            "traffic_source": c.traffic_source or "",
            "traffic_source_detail": c.traffic_source_detail or "",
            "referrer": c.referrer or "",
            "referrers": customer_referrers(c),
            "service_teacher": c.service_teacher or "",
            "referrer_handler": c.referrer_handler or "",
            "referral_date": c.referral_date or "",
            "position_sort_orders": c.position_sort_orders or {},
            "space_id": c.space_id or "",
        }
        for c in customers
    ]


@router.post("/batch")
async def batch_customers(data: BatchRequest, request: Request):
    """批量获取客户信息，只返回 id/nickname/name/member_type/positions"""
    id_set = set(data.ids)
    customers = customer_access_service.filter_customers(request, customer_service.list_customers())
    return [
        {
            "id": c.id,
            "nickname": c.nickname,
            "name": c.name or "",
            "member_type": c.member_type or "", "card_status": getattr(c, "card_status", ""), "card_status_tone": getattr(c, "card_status_tone", "neutral"),
            "positions": c.positions or [],
            "space_id": c.space_id or "",
        }
        for c in customers
        if c.id in id_set
    ]


@router.patch("/bulk-update")
async def bulk_update_customers(data: BulkCustomerUpdate, request: Request):
    changes = data.model_dump(exclude_none=True, exclude={"ids"})
    if not changes:
        raise HTTPException(status_code=422, detail="请选择要批量修改的信息")
    if "service_teacher" in changes:
        changes["service_teacher"] = changes["service_teacher"].strip()
        if changes["service_teacher"] and not customer_service.get_by_nickname(changes["service_teacher"]):
            raise HTTPException(status_code=422, detail="Sales不存在或已停用")
    ids = list(dict.fromkeys(data.ids))
    before = []
    labels = {"customer_quality": "客户质量", "service_teacher": "Sales"}
    for customer_id in ids:
        customer = customer_access_service.require_customer_scope(request, customer_id, action="修改")
        if customer.is_deleted:
            raise HTTPException(status_code=409, detail="所选客户已停用，请刷新后重试")
        before.append({"昵称": customer.nickname, **{labels[key]: getattr(customer, key) for key in changes}})
    try:
        updated = customer_service.bulk_update_profiles(ids, changes)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    details = []
    after = []
    for previous, customer in zip(before, updated):
        changed = [f"{labels[key]}({previous[labels[key]] or '未设置'}→{getattr(customer, key) or '未设置'})"
                   for key in changes if previous[labels[key]] != getattr(customer, key)]
        after.append({"昵称": customer.nickname, **{labels[key]: getattr(customer, key) for key in changes}})
        if changed:
            details.append(f"{customer.nickname}：{'，'.join(changed)}")
    if details:
        content = f"批量修改{len(details)}位客户：" + "；".join(details)
        if len(content) > 8000:
            content = f"批量修改{len(details)}位客户的{'、'.join(labels[key] for key in changes)}，完整逐人变更见操作详情"
        request.state.operation_log_context = {
            "content": content,
            "before_data": {"客户信息": before}, "after_data": {"客户信息": after},
        }
    else:
        request.state.skip_operation_log = True
    return {"updated_count": len(details)}


@router.get("/disabled")
async def list_disabled_customers(request: Request):
    """列出所有已停用的客户"""
    customers = customer_access_service.filter_customers(
        request,
        customer_service.list_disabled_customers(),
    )
    items = [
        {
            "id": c.id,
            "nickname": c.nickname,
            "name": c.name or "",
            "member_type": c.member_type or "", "card_status": getattr(c, "card_status", ""), "card_status_tone": getattr(c, "card_status_tone", "neutral"),
            "phone": c.phone or "",
            "deleted_at": c.deleted_at.isoformat() if c.deleted_at else "",
            "deleted_by": c.deleted_by or "",
        }
        for c in customers
    ]
    role = get_request_roles(request)
    return [customer_contact_service.protect_customer_data(item, role) for item in items]


@router.post("/{customer_id}/contact-access")
async def access_customer_contact(customer_id: str, data: ContactAccessRequest, request: Request):
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    if not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail="没有查看该客户的权限")

    role = get_request_roles(request)
    if not customer_contact_service.can_access(role, data.field, data.action):
        action_label = "查看" if data.action == "view" else "复制"
        field_label = "手机号" if data.field == "phone" else "微信号"
        raise HTTPException(status_code=403, detail=f"没有{action_label}{field_label}的权限")

    value = str(getattr(customer, data.field, "") or "")
    request.state.skip_operation_log = True
    customer_contact_service.record_access(
        field=data.field,
        action=data.action,
        customer_id=customer.id,
        customer_name=customer.nickname or customer.name or "未命名客户",
        operator=(getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")),
        operator_role="、".join(role),
        source=getattr(request.state, "source", "pc"),
        ip=get_client_ip(request),
    )
    return {"field": data.field, "value": value}


@router.get("/{customer_id}")
async def get_customer(customer_id: str, request: Request):
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    if customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    if not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail="没有查看该客户的权限")
    role = get_request_roles(request)
    result = customer_access_service.protect_sensitive_data(_fill_visit_count(customer), role)
    if not customer_access_service.can_view_transaction_summary(role):
        result["total_payment"] = None
    result["customer_access_permissions"] = customer_access_service.get_customer_permissions(role)
    return customer_contact_service.protect_customer_data(
        result,
        role,
        include_permissions=True,
    )


@router.patch("/{customer_id}")
async def update_customer(customer_id: str, data: CustomerUpdate, request: Request):
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    update_data = data.model_dump(exclude_unset=True)
    _validate_follow_up_status(update_data.get("follow_up_status"))
    role = get_request_roles(request)
    if not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail="没有修改该客户的权限")
    blocked_sensitive_fields = [
        field
        for field in update_data
        if not customer_access_service.can_view_sensitive_field(role, field)
    ]
    if blocked_sensitive_fields:
        raise HTTPException(status_code=403, detail="不能修改无权查看的客户隐私信息")
    for field in ("phone", "wechat"):
        if field in update_data and not customer_contact_service.can_access(role, field, "edit"):
            field_label = "手机号" if field == "phone" else "微信号"
            raise HTTPException(status_code=403, detail=f"没有修改{field_label}的权限")
    try:
        customer = customer_service.update_customer(customer_id, data, actor_id=getattr(request.state, "user_id", ""))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    changed_contact_labels = [
        "手机号" if field == "phone" else "微信号"
        for field in ("phone", "wechat")
        if field in update_data
    ]
    if changed_contact_labels:
        request.state.operation_log_context = {
            "content": f'修改客户“{customer.nickname or customer.name or "未命名客户"}”的{"、".join(changed_contact_labels)}',
            "entity_id": customer.id,
        }
    # 修改响应仅回显当前请求刚提交的数据；重新查询时仍统一脱敏。
    result = _fill_visit_count(customer)
    result["customer_access_permissions"] = customer_access_service.get_customer_permissions(role)
    result["contact_permissions"] = customer_contact_service.get_role_permissions(role)
    return result


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, request: Request):
    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    if not customer_access_service.can_view_customer_for_request(request, customer):
        raise HTTPException(status_code=403, detail="没有停用该客户的权限")
    deleted_by = getattr(request.state, "user_name", "") or "未知"
    if not customer_service.delete_customer(customer_id, deleted_by):
        raise HTTPException(status_code=404, detail="客户不存在")
    return {"message": "已停用"}


@router.post("/{customer_id}/restore")
async def restore_customer(customer_id: str, request: Request, _admin: str = Depends(require_admin)):
    customer = customer_service.restore_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在或未被停用")
    return customer_contact_service.protect_customer_data(
        _fill_visit_count(customer),
        get_request_roles(request),
        include_permissions=True,
    )


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
