import io
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models.visit import VisitRecordCreate
from app.services import visit_service
from app.services import customer_service
from app.services.customer_service import get_customer
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/visits", tags=["visits"])


def _fill_member_type(record):
    """从客户信息实时填充会员身份、昵称和引流来源"""
    data = record.model_dump(mode="json")
    customer = get_customer(record.customer_id)
    data["member_type"] = customer.member_type if customer else ""
    data["nickname"] = customer.nickname if customer else ""
    data["referrer"] = customer.referrer if customer else ""
    return data


def _fill_daily_amount(items: list, date: str):
    """汇总每个客户当日成交金额，注入 daily_amount 字段"""
    if not date:
        return
    from app.services import (
        membership_card_service,
        group_case_service,
        emotional_release_service,
        energy_knot_service,
        internal_course_service,
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
):
    records = visit_service.list_visits(date, customer_id, space_id)
    items = [_fill_member_type(r) for r in records]
    if date:
        _fill_daily_amount(items, date)
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


@router.get("/export")
async def export_visits(date: str = None, space_id: str = None):
    """导出邀约到场 xlsx，格式与 PC 端一致"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    records = visit_service.list_visits(date, space_id=space_id)
    items = [_fill_member_type(r) for r in records]

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
            "参与次数": v.get("visit_count") or 0,
            "会员身份": v.get("member_type") or "",
            "当日需求": v.get("needs") or "",
            "组长情况": role or "-",
            "组长获得的信息": "",
            "邀约人": v.get("referrer_handler") or "",
        })

    if not rows:
        # 空表也返回有效 xlsx（只有表头）
        rows = []

    headers = ["引流人", "客户昵称", "预计时间", "参与次数", "会员身份", "当日需求", "组长情况", "组长获得的信息", "邀约人"]
    col_widths = [10, 12, 10, 10, 12, 40, 10, 30, 10]

    wb = Workbook()
    ws = wb.active
    ws.title = "邀约到场"
    ws.sheet_view.showGridLines = False

    # 设置列宽
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w

    # 写表头
    header_font = Font(bold=True)
    header_fill = PatternFill(start_color="D0D3D6", end_color="D0D3D6", fill_type="solid")
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
        cell.alignment = Alignment(vertical="center", wrap_text=True)

    # 写数据行
    for r, row_data in enumerate(rows, 2):
        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=r, column=c, value=row_data[h])
            cell.border = thin_border
            cell.alignment = Alignment(vertical="center", wrap_text=True)

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
    # 记录更新前的到场状态
    old_record = visit_service.get_visit(visit_id)
    old_arrived = old_record.arrived if old_record else False

    record = visit_service.update_visit(visit_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

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

    return _fill_member_type(record)


@router.delete("/{visit_id}")
async def delete_visit(visit_id: str):
    if not visit_service.delete_visit(visit_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "已删除"}
