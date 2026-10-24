import io

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.models.visit import VisitRecordCreate
from app.services import (
    customer_access_service,
    customer_service,
    customer_tag_service,
    membership_card_service,
    visit_note_service,
    visit_service,
    visit_verification_service,
)
from app.services.customer_service import get_customer
from app.utils.customer_search import masked_customer_phone, phone_suffix
from app.utils.pagination import paginate
from app.utils.record_ownership import ensure_creator_for_changed_fields, ensure_record_creator, stamp_creator
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/visits", tags=["visits"])

VISIT_NOTE_CATEGORY_LABELS = {
    "visit_need": "来访需求",
    "customer_info": "深度需求",
    "follow_up": "跟进点",
    "customer_feedback": "客户反馈",
}


def _visible_customer_ids(request: Request | None) -> set[str] | None:
    if request is None:
        return None
    return customer_access_service.visible_customer_ids(
        request,
        customer_service.list_customers(),
    )


def _filter_visible_visits(request: Request | None, records: list) -> list:
    visible_ids = _visible_customer_ids(request)
    if visible_ids is None:
        return records
    return [record for record in records if record.customer_id in visible_ids]


def _fill_member_type(record, private_need: str = "", *, refresh_remaining: bool = False, shared_summary: dict | None = None, first_arrivals: dict[str, str] | None = None):
    """从客户信息实时填充会员身份、昵称和引流来源"""
    data = record.model_dump(mode="json")
    from app.services import daily_customer_note_service

    data.update(daily_customer_note_service.visit_summary(record.id) if shared_summary is None else shared_summary)
    customer = get_customer(record.customer_id)
    data["member_type"] = customer.member_type if customer else ""
    data["nickname"] = customer.nickname if customer else ""
    data["referrer"] = customer.referrer if customer else ""
    data["needs"] = private_need
    if first_arrivals is None:
        first_arrivals = visit_service.first_arrival_dates({record.customer_id})
    first_arrival = first_arrivals.get(record.customer_id, "")
    data["is_new_customer"] = not first_arrival or first_arrival >= record.visit_date
    if refresh_remaining:
        data["remaining_count"] = visit_service.current_remaining_by_customer({record.customer_id}).get(record.customer_id, 0)
    return data


def _private_need_map(request: Request | None, visit_ids: list[str], *, notes=None) -> dict[str, str]:
    if request is None or not visit_ids:
        return {}
    from app.services import visit_note_service

    visible_notes = visit_note_service.filter_visible_notes(
        visit_note_service.list_notes(visit_ids) if notes is None else notes,
        getattr(request.state, "user_id", "") or "",
        getattr(request.state, "user_owner", "") or "",
        getattr(request.state, "user_name", "") or "",
    )
    result: dict[str, list[str]] = {}
    for note in visible_notes:
        if note.category != "visit_need":
            continue
        result.setdefault(note.visit_id, []).append(
            f"{visit_note_service.display_author(note)}：{visit_note_service.display_content(note)}"
        )
    return {visit_id: "\n".join(lines) for visit_id, lines in result.items()}


def _visit_note_maps(request: Request | None, visit_ids: list[str], *, notes=None) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """一次读取可见信息，同时生成兼容需求文本和表格所需的信息列表。"""
    if request is None or not visit_ids:
        return {}, {}
    from app.services import visit_note_service

    account_id = getattr(request.state, "user_id", "") or ""
    owner_name = getattr(request.state, "user_owner", "") or ""
    username = getattr(request.state, "user_name", "") or ""
    visible_notes = visit_note_service.filter_visible_notes(
        visit_note_service.list_notes(visit_ids) if notes is None else notes,
        account_id,
        owner_name,
        username,
    )
    need_lines: dict[str, list[str]] = {}
    note_map: dict[str, list[dict]] = {}
    for note in visible_notes:
        can_manage = visit_note_service.can_manage_note(
            note,
            account_id,
            owner_name,
            username,
        )
        item = note.model_dump(mode="json")
        item["category_label"] = VISIT_NOTE_CATEGORY_LABELS[note.category]
        item["can_edit"] = can_manage
        item["can_delete"] = can_manage
        note_map.setdefault(note.visit_id, []).append(item)
        if note.category == "visit_need":
            need_lines.setdefault(note.visit_id, []).append(
                f"{visit_note_service.display_author(note)}：{visit_note_service.display_content(note)}"
            )
    return (
        {visit_id: "\n".join(lines) for visit_id, lines in need_lines.items()},
        note_map,
    )


def _fill_daily_amount(items: list, date: str):
    """汇总每个客户当日成交金额，注入 daily_amount 字段"""
    if not date:
        return
    from app.services import (
        emotional_release_service,
        energy_knot_service,
        group_case_service,
        internal_course_service,
        membership_card_service,
        oh_card_reading_service,
        other_project_service,
    )

    def _get_amount(r):
        return getattr(r, "fee", None) or getattr(r, "price", None) or getattr(r, "amount", None) or 0

    def _get_date(r):
        d = getattr(r, "deal_date", None)
        if d:
            return d
        ca = getattr(r, "created_at", None)
        if ca:
            if hasattr(ca, "strftime"):
                return ca.strftime("%Y-%m-%d")
            return str(ca)[:10]
        return ""

    # 按 customer_id 汇总当日金额
    amount_map: dict[str, float] = {}
    services = [
        membership_card_service.list_cards(),
        group_case_service.list_cases(),
        emotional_release_service.list_releases(),
        energy_knot_service.list_knots(),
        internal_course_service.list_courses(),
        oh_card_reading_service.list_readings(),
        other_project_service.list_projects(),
    ]
    for records in services:
        for r in records:
            if getattr(r, "voided", False):
                continue
            if getattr(r, "is_deleted", False):
                continue
            if _get_date(r) == date:
                cid = getattr(r, "customer_id", "")
                if cid:
                    amount_map[cid] = amount_map.get(cid, 0) + _get_amount(r)

    for item in items:
        item["daily_amount"] = amount_map.get(item.get("customer_id", ""), 0)


@router.get("")
async def list_visits(
    date: str = None,
    customer_id: str = None,
    space_id: str = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
    request: Request = None,
):
    records = _filter_visible_visits(
        request,
        visit_service.list_visits(date, customer_id, space_id),
    )
    from app.services import daily_customer_note_service, visit_note_service

    visit_ids = [record.id for record in records]
    notes = visit_note_service.list_notes(visit_ids, ensure_legacy=False)
    need_map, note_map = _visit_note_maps(request, visit_ids, notes=notes)
    summaries = daily_customer_note_service.visit_summaries(visit_ids, notes=notes)
    first_arrivals = visit_service.first_arrival_dates({record.customer_id for record in records})
    membership_remaining = membership_card_service.list_current_card_remaining({record.customer_id for record in records})
    visible_tags = customer_tag_service.visible_tags_by_customer(getattr(request.state, "user_id", "") if request else "")
    items = []
    for record in records:
        item = _fill_member_type(record, need_map.get(record.id, ""), shared_summary=summaries.get(record.id, {}), first_arrivals=first_arrivals)
        item["membership_remaining_count"] = membership_remaining.get(record.customer_id, 0)
        item["customer_tags"] = visible_tags.get(record.customer_id, [])
        item["visit_notes"] = note_map.get(record.id, [])
        item = customer_access_service.protect_note_fields(item, get_request_roles(request) if request else ["超级管理员"])
        item["visit_need_tags"] = visit_note_service.visit_need_tag_names(item["visit_notes"])
        items.append(item)
    role = get_request_roles(request) if request else ["超级管理员"]
    if date and customer_access_service.can_view_transaction_summary(role):
        _fill_daily_amount(items, date)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.get("/light")
async def list_visits_light(
    date: str = None,
    space_id: str = None,
    request: Request = None,
):
    """轻量版列表，不计算活动详情，适用于主页快速加载"""
    try:
        items = visit_service.list_visits_light(date, space_id)
        visible_ids = _visible_customer_ids(request)
        if visible_ids is not None:
            items = [item for item in items if item.get("customer_id") in visible_ids]
        from app.services import daily_customer_note_service, visit_note_service

        visit_ids = [str(item.get("id") or "") for item in items]
        notes = visit_note_service.list_notes(visit_ids, ensure_legacy=request is not None)
        need_map, note_map = _visit_note_maps(request, visit_ids, notes=notes)
        summaries = daily_customer_note_service.visit_summaries(visit_ids, notes=notes)
        first_arrivals = visit_service.first_arrival_dates({item["customer_id"] for item in items})
        people = {c.id: c for c in customer_service.list_customers()}
        for item in items:
            item["name"] = getattr(people.get(item["customer_id"]), "name", "") or ""
            item["phone_suffix"] = phone_suffix(people.get(item["customer_id"]))
            item["phone_masked"] = masked_customer_phone(people.get(item["customer_id"]))
            first_arrival = first_arrivals.get(item["customer_id"], "")
            item["is_new_customer"] = not first_arrival or first_arrival >= item["visit_date"]
            item["needs"] = need_map.get(str(item.get("id") or ""), "")
            item.update(summaries.get(str(item.get("id") or ""), {}))
            item["visit_notes"] = note_map.get(str(item.get("id") or ""), [])
        protected = [customer_access_service.protect_note_fields(item, get_request_roles(request) if request else ["超级管理员"]) for item in items]
        for item in protected:
            # 保留已按权限过滤的需求标签和正文，供轻量列表分别展示；不携带其他备注。
            item["visit_need_entries"] = [
                {key: note.get(key) for key in ("id", "content", "need_tags", "feedback_person", "created_by")}
                for note in item.get("visit_notes", []) if note.get("category") == "visit_need"
            ]
            item.pop("visit_notes", None)  # 轻量列表只返回过滤后的汇总，不重复携带全部备注正文。
        return protected
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
    request: Request = None,
):
    """返回各日期的到场人数统计 {date: count}，不做活动计数。支持 member_types 过滤权限"""
    ids = None
    if member_types is not None:
        types = [m for m in member_types.split(",") if m]
        if types:
            customers = customer_service.list_all_customers()
            ids = [c.id for c in customers if c.member_type in types]
            if not ids:
                return {}
        else:
            ids = None  # member_types 参数为空 → 超管，不过滤
    elif customer_ids is not None:
        ids = [x for x in customer_ids.split(",") if x]
        if not ids:
            return {}
    visible_ids = _visible_customer_ids(request)
    if visible_ids is not None:
        ids = list(visible_ids if ids is None else visible_ids.intersection(ids))
        if not ids:
            return {}
    return visit_service.get_date_counts(ids, start_date, end_date, space_id)


@router.get("/search-customers")
async def search_customers(q: str = "", request: Request = None):
    results = visit_service.search_customers(q)
    visible_ids = _visible_customer_ids(request)
    if visible_ids is None:
        return results
    return [result for result in results if result.id in visible_ids]


@router.post("/reorder")
async def reorder_visits(data: dict, request: Request):
    """批量更新排序权重。传入 {"ids": ["id1", "id2", ...]} 按顺序设置 sort_order"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    records = {record.id: record for record in visit_service.list_visits()}
    if any(visit_id not in records for visit_id in ids):
        raise HTTPException(status_code=404, detail="邀约记录不存在")
    for visit_id in ids:
        visit_verification_service.ensure_record_unverified(records[visit_id])
    visible_ids = _visible_customer_ids(request)
    if visible_ids is not None and any(
        records[visit_id].customer_id not in visible_ids for visit_id in ids
    ):
        raise HTTPException(status_code=403, detail="只能调整可见客户的邀约顺序")
    visit_service.reorder_visits(ids)
    return {"message": "排序已更新"}


@router.get("/export")
async def export_visits(date: str = None, space_id: str = None, request: Request = None):
    """导出邀约到场 xlsx，格式与 PC 端一致"""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    records = _filter_visible_visits(
        request,
        visit_service.list_visits(date, space_id=space_id),
    )
    active_records = [record for record in records if not record.cancelled]
    need_map, note_map = _visit_note_maps(request, [record.id for record in active_records])
    first_arrivals = visit_service.first_arrival_dates({record.customer_id for record in active_records})
    items = [_fill_member_type(record, need_map.get(record.id, ""), first_arrivals=first_arrivals) for record in active_records]
    items = [customer_access_service.protect_note_fields({**item, "visit_notes": note_map.get(item["id"], [])},
              get_request_roles(request) if request else ["超级管理员"]) for item in items]
    membership_remaining = membership_card_service.list_current_card_remaining({record.customer_id for record in active_records})
    # 构建组长映射（复用 PC 端逻辑）
    role_map = {}
    for r in items:
        if r.get("is_leader"):
            role_map[r["customer_id"]] = "组长"

    rows = []
    for v in items:
        role = role_map.get(v["customer_id"], "")
        rows.append({
            "引流人": v.get("referrer") or "-",
            "客户昵称": v.get("nickname") or "",
            "预计时间": v.get("visit_time") or "",
            "会员身份": v.get("member_type") or "",
            "会员卡剩余卡次": "不限次" if membership_remaining.get(v["customer_id"]) == "unlimited" else membership_remaining.get(v["customer_id"], 0),
            "当前卡次": v.get("card_status") or "",
            "来访标签": "、".join(visit_note_service.visit_need_tag_names(v.get("visit_notes", []))),
            "来访需求": v.get("needs") or "",
            "组长情况": role or "-",
            "邀约人": v.get("referrer_handler") or "",
            "接待人": v.get("receptionist") or "",
            "目标": v.get("goal") or "",
        })

    if not rows:
        # 空表也返回有效 xlsx（只有表头）
        rows = []

    headers = ["引流人", "客户昵称", "预计时间", "会员身份", "会员卡剩余卡次", "来访标签", "当前卡次", "来访需求", "组长情况", "邀约人", "接待人", "目标"]
    if not customer_access_service.can_view_detail_tab(get_request_roles(request) if request else ["超级管理员"], "visit_need_tags"):
        headers.remove("来访标签")
    if not customer_access_service.can_view_note(get_request_roles(request) if request else ["超级管理员"], "visit_need"):
        headers.remove("来访需求")
    col_widths = {"引流人": 10, "客户昵称": 12, "预计时间": 10, "会员身份": 12, "会员卡剩余卡次": 16, "当前卡次": 14, "来访标签": 24,
                  "来访需求": 40, "组长情况": 10, "邀约人": 10, "接待人": 10, "目标": 20}

    wb = Workbook()
    ws = wb.active
    ws.title = "邀约到场"
    ws.sheet_view.showGridLines = False

    # 设置列宽
    for i, header in enumerate(headers, 1):
        ws.column_dimensions[chr(64 + i)].width = col_widths[header]

    # 写表头
    header_font = Font(bold=True)
    header_fill = PatternFill(start_color="D0D3D6", end_color="D0D3D6", fill_type="solid")
    leader_fill = PatternFill(start_color="FFA2CD62", end_color="FFA2CD62", fill_type="solid")
    leader_emphasis_font = Font(size=13, bold=True)
    nickname_column = headers.index("客户昵称") + 1
    leader_status_column = headers.index("组长情况") + 1
    thin_border = Border(
        left=Side(style="thin", color="C0C4CC"),
        right=Side(style="thin", color="C0C4CC"),
        top=Side(style="thin", color="C0C4CC"),
        bottom=Side(style="thin", color="C0C4CC"),
    )

    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # 写数据行
    for r, row_data in enumerate(rows, 2):
        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=r, column=c, value=row_data[h])
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            if row_data["组长情况"] == "组长":
                cell.fill = leader_fill
                if c in {nickname_column, leader_status_column}:
                    cell.font = leader_emphasis_font

    # 输出到内存
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    # HTTP 头部只支持 latin-1，中文文件名需按 RFC 5987 用 filename* 百分号编码
    from urllib.parse import quote
    if date:
        y, m, d = date.split('-')
        date_text = f"{int(y)}年{int(m)}月{int(d)}日"
    else:
        date_text = "全部"
    filename = f"{date_text}邀约名单.xlsx"
    disposition = f"attachment; filename=\"visits_{date or 'all'}.xlsx\"; filename*=UTF-8''{quote(filename)}"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": disposition},
    )


@router.get("/{visit_id}")
async def get_visit(visit_id: str, request: Request):
    record = visit_service.get_visit(visit_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, record.customer_id)
    need_map, note_map = _visit_note_maps(request, [record.id])
    item = _fill_member_type(record, need_map.get(record.id, ""), refresh_remaining=True)
    item["visit_notes"] = note_map.get(record.id, [])
    return customer_access_service.protect_note_fields(item, get_request_roles(request))


@router.post("")
async def create_visit(data: VisitRecordCreate, request: Request):
    customer_access_service.require_customer_scope(request, data.customer_id, action="邀约")
    for field, category in (("feedback", "customer_info"), ("healing_notes", "follow_up"), ("experience", "customer_feedback")):
        if getattr(data, field, ""):
            customer_access_service.require_note_access(request, category)
    visit_verification_service.ensure_scope_unverified(data.visit_date, data.space_id or "")
    try:
        initial_need = str(data.needs or "").strip()
        if initial_need and not customer_access_service.can_view_detail_tab(get_request_roles(request), "visit_need_detail"):
            raise HTTPException(403, "没有来访需求详情的查看权限")
        create_data = data.model_copy(update={"needs": ""}) if initial_need else data
        record = visit_service.create_visit(stamp_creator(create_data, request))
        if initial_need:
            from app.services import visit_note_service

            visit_note_service.create_note(
                record.id,
                "visit_need",
                initial_need,
                creator_id=getattr(request.state, "user_id", "") or "",
                creator=(
                    getattr(request.state, "user_owner", "")
                    or getattr(request.state, "user_name", "")
                    or ""
                ),
            )
        return customer_access_service.protect_note_fields(_fill_member_type(record, initial_need, refresh_remaining=True), get_request_roles(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{visit_id}")
async def update_visit(visit_id: str, data: dict, request: Request):
    # 记录更新前的到场状态
    old_record = visit_service.get_visit(visit_id)
    if not old_record:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, old_record.customer_id, action="修改")
    if data.get("customer_id") and data["customer_id"] != old_record.customer_id:
        customer_access_service.require_customer_scope(request, data["customer_id"], action="邀约")
    visit_verification_service.ensure_update_allowed(old_record, data)
    if "needs" in data and old_record.cancelled:
        raise HTTPException(status_code=400, detail="该邀约已取消并已锁定，请先恢复邀约后再修改来访需求")
    if "needs" in data and "cancelled" in data:
        raise HTTPException(status_code=400, detail="取消或恢复邀约时不能同时修改来访需求")
    ensure_creator_for_changed_fields(
        request,
        old_record,
        data,
        {
            "visit_date",
            "visit_time",
            "customer_id",
            "referrer_handler",
        },
        "邀约的客户、邀约人或时间",
        "visits",
    )
    old_arrived = old_record.arrived if old_record else False

    # 兼容旧客户端：客户信息/跟进点不再覆盖整段文本，而是按当前账号追加为独立记录。
    collaboration_fields = {
        "needs": "visit_need",
        "feedback": "customer_info",
        "healing_notes": "follow_up",
        "experience": "customer_feedback",
    }
    collaboration_updates = []
    for field, category in collaboration_fields.items():
        if field not in data:
            continue
        content = str(data.pop(field) or "").strip()
        current = str(getattr(old_record, field, "") or "").strip() if old_record else ""
        if content and content != current:
            customer_access_service.require_note_access(request, category)
            if category == "visit_need" and not customer_access_service.can_view_detail_tab(get_request_roles(request), "visit_need_detail"):
                raise HTTPException(403, "没有来访需求详情的查看权限")
            collaboration_updates.append((category, content))

    try:
        record = visit_service.update_visit(
            visit_id, data,
            allow_empty_cancel_reason=getattr(request.state, "source", "") == "miniprogram",
        ) if data else old_record
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    if collaboration_updates:
        from app.services import visit_note_service

        creator_id = getattr(request.state, "user_id", "") or ""
        creator = (
            getattr(request.state, "user_owner", "")
            or getattr(request.state, "user_name", "")
            or ""
        )
        for category, content in collaboration_updates:
            visit_note_service.create_note(
                visit_id,
                category,
                content,
                creator_id=creator_id,
                creator=creator,
            )
        record = visit_service.get_visit(visit_id)

    # 从未到场 → 已到场：发送通知给客户
    if not old_arrived and record.arrived:
        from app.services import client_notification_service, customer_service
        customer = customer_service.get_customer(record.customer_id)
        if customer:
            activity_names = "、".join(a.name for a in (record.activities or []) if a.name) or "今日活动"
            client_notification_service.create_notification(
                customer_id=record.customer_id,
                type="arrival_confirmed",
                title="已确认到场",
                content=f'您在{record.visit_date}的{activity_names}已确认到场',
                activity_name=activity_names,
                activity_date=record.visit_date,
                operator="管理员",
            )

    need_map = _private_need_map(request, [record.id])
    return customer_access_service.protect_note_fields(_fill_member_type(record, need_map.get(record.id, ""), refresh_remaining=True), get_request_roles(request))


@router.delete("/{visit_id}")
async def delete_visit(visit_id: str, request: Request):
    record = visit_service.get_visit(visit_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    customer_access_service.require_customer_scope(request, record.customer_id, action="删除")
    visit_verification_service.ensure_record_unverified(record)
    ensure_record_creator(request, record, "邀约", "visits")
    if not visit_service.delete_visit(visit_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
