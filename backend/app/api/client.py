import uuid
from datetime import date as date_cls, datetime
from fastapi import APIRouter, HTTPException, Query, Request
from app.services import (
    class_record_service,
    course_type_service,
    internal_course_session_service,
    membership_card_service,
    project_deduction_service,
    space_service,
    visit_service,
)
from app.api.customer_detail import _build_payment_records, _build_activities
from app.services.customer_service import list_customers, get_customer
from app.services.storage import load_data, save_item

router = APIRouter(prefix="/api/client", tags=["client"])

SIGNUPS_FILE = "client_signups.json"


def _get_visible_types() -> set[str]:
    """获取 show_in_client=true 的课程类型名称集合"""
    return {t["name"] for t in course_type_service.list_course_types() if t.get("show_in_client")}


def _build_customer_map() -> dict:
    customers = list_customers()
    return {c.id: c for c in customers}


def _get_teacher_names(teacher_ids: list[str], customer_map: dict) -> list[str]:
    names = []
    for tid in teacher_ids:
        c = customer_map.get(tid)
        if c:
            names.append(c.nickname)
    return names


def _get_space_map() -> tuple[dict[str, str], dict[str, str]]:
    space_map: dict[str, str] = {}
    room_map: dict[str, str] = {}
    for sp in space_service.get_all_spaces():
        space_map[sp.id] = sp.name
        for rm in sp.rooms:
            room_map[rm.id] = rm.name
    return space_map, room_map


def _aggregate_visible_activities(visible_types: set[str]) -> list[dict]:
    """聚合 class 和 ics 活动，只保留 course_type 在可见集合中的"""
    items = []

    for r in class_record_service.list_records():
        d = r.model_dump(mode="json")
        ct = d.get("course_type", "")
        if ct and ct in visible_types:
            items.append({"type": "class", "id": d["id"], "data": d, "date": d.get("date", "")})

    for s in internal_course_session_service.list_sessions():
        d = s.model_dump(mode="json") if hasattr(s, "model_dump") else s
        ct = d.get("course_type", "")
        if ct and ct in visible_types:
            date_str = d.get("date", "")
            items.append({"type": "ics", "id": d.get("id", ""), "data": d, "date": date_str})

    return items


def _format_activity(item: dict, customer_map: dict, space_map: dict, room_map: dict) -> dict:
    """将原始活动数据格式化为客户端需要的结构"""
    d = item["data"]
    activity_type = item["type"]

    # 活动名称
    if activity_type == "class":
        # PC 后台「活动名称」保存在 course_name;activity_name 是场次自定义名(如"潜意识绘画")。
        # 谁被自定义过(不同于类型名)就用谁;course_name 优先(后台改名要即时反映)
        ct_name = d.get("course_type", "")
        course_name = d.get("course_name", "")
        activity_name = d.get("activity_name", "")
        if course_name and course_name != ct_name:
            name = course_name
        elif activity_name:
            name = activity_name
        else:
            name = course_name or ct_name
    else:
        name = d.get("course_name", "")

    # 老师
    teacher_ids = d.get("teacher_ids", [])
    teacher_names = _get_teacher_names(teacher_ids, customer_map)

    # 主持人（ics 用 host_id）
    if activity_type == "ics" and d.get("host_id"):
        host = customer_map.get(d["host_id"])
        if host:
            teacher_names = [host.nickname]

    # 空间
    space_name = space_map.get(d.get("space_id", ""), "")
    room_name = room_map.get(d.get("room_id", ""), "")
    location = f"{space_name} {room_name}".strip() if space_name else ""

    # 简介
    description = d.get("course_description") or d.get("description", "")

    return {
        "id": item["id"],
        "type": activity_type,
        "name": name,
        "date": d.get("date", ""),
        "start_time": d.get("start_time", ""),
        "end_time": d.get("end_time", ""),
        "teacher_names": teacher_names,
        "description": description,
        "activity_mode": d.get("activity_mode", "线下"),
        "is_public_welfare": d.get("is_public_welfare", False),
        "space_name": space_name,
        "room_name": room_name,
        "location": location,
        "course_type": d.get("course_type", ""),
    }


def _load_signups(activity_id: str) -> list[dict]:
    """读取某活动的全部报名记录,按报名时间升序。兼容两种存储形态:按 uuid 单条存储 / 遗留的 signups 列表键"""
    data = load_data(SIGNUPS_FILE)
    rows: list[dict] = []
    for v in data.values():
        if isinstance(v, dict) and v.get("activity_id") == activity_id:
            rows.append(v)
        elif isinstance(v, list):
            rows.extend(s for s in v if isinstance(s, dict) and s.get("activity_id") == activity_id)
    rows.sort(key=lambda s: s.get("created_at", ""))
    return rows


def _count_signups(activity_id: str) -> int:
    """统计活动报名人数"""
    return len(_load_signups(activity_id))


def _current_customer_id(request: Request) -> str:
    """尽力解析 Authorization 头里的客户 token(公开 GET 接口中间件不解析,这里自行解码)"""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return ""
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return ""
    try:
        from app.middleware.jwt_auth import decode_token
        payload = decode_token(token)
        if payload.get("role") == "customer":
            return payload.get("customer_id", payload.get("sub", ""))
    except Exception:
        pass
    return ""


def _find_activity(activity_id: str) -> dict | None:
    """从 class 和 ics 中查找活动，返回原始 item 或 None"""
    record = class_record_service.get_record(activity_id)
    if record:
        d = record.model_dump(mode="json")
        return {"type": "class", "id": d["id"], "data": d, "date": d.get("date", "")}

    for s in internal_course_session_service.list_sessions():
        sid = s.id if hasattr(s, "id") else s.get("id", "")
        if sid == activity_id:
            d = s.model_dump(mode="json") if hasattr(s, "model_dump") else s
            return {"type": "ics", "id": sid, "data": d, "date": d.get("date", "")}

    return None


@router.get("/activities")
def list_activities(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    """客户端活动列表 — 默认只返回未来活动;指定日期范围时按范围返回(含过去)"""
    visible_types = _get_visible_types()
    if not visible_types:
        return {"items": [], "total": 0, "page": 1, "page_size": 20, "total_pages": 0}

    items = _aggregate_visible_activities(visible_types)

    if start_date or end_date:
        # 指定日期范围(含过去日期),用于客户端按周/按日查询
        if start_date:
            items = [i for i in items if i["date"] >= start_date]
        if end_date:
            items = [i for i in items if i["date"] <= end_date]
    else:
        # 默认只保留未来活动（今天及以后）
        today = date_cls.today().isoformat()
        items = [i for i in items if i["date"] >= today]

    # 注入名称
    customer_map = _build_customer_map()
    space_map, room_map = _get_space_map()

    formatted = [_format_activity(i, customer_map, space_map, room_map) for i in items]

    # 按日期升序，同日期按开始时间升序
    formatted.sort(key=lambda x: (x["date"], x["start_time"] or ""))

    # 分页
    total = len(formatted)
    start = (page - 1) * page_size
    end = start + page_size
    paged = formatted[start:end]

    return {
        "items": paged,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/activities/{activity_id}")
def get_activity(activity_id: str, request: Request):
    """单个活动详情"""
    item = _find_activity(activity_id)
    if not item:
        raise HTTPException(status_code=404, detail="活动不存在")

    # 检查可见性
    visible_types = _get_visible_types()
    ct = item["data"].get("course_type", "")
    if not ct or ct not in visible_types:
        raise HTTPException(status_code=404, detail="活动不存在")

    customer_map = _build_customer_map()
    space_map, room_map = _get_space_map()
    result = _format_activity(item, customer_map, space_map, room_map)

    # 参与者 = 后台维护的 participant_ids(+分组成员) ∪ 小程序报名记录
    # 当前用户(若已登录)排最前并标记 is_me
    customer_id = _current_customer_id(request)
    member_ids: list[str] = []
    seen: set[str] = set()
    for cid in (item["data"].get("participant_ids") or []):
        if cid and cid not in seen:
            seen.add(cid)
            member_ids.append(cid)
    for g in (item["data"].get("groups") or []):
        for cid in (g.get("member_ids") or []):
            if cid and cid not in seen:
                seen.add(cid)
                member_ids.append(cid)
    participants = []
    for cid in member_ids:
        c = customer_map.get(cid)
        participants.append({
            "nickname": (c.nickname if c and c.nickname else "匿名"),
            "is_me": bool(customer_id) and cid == customer_id,
        })
    for s in _load_signups(activity_id):
        cid = s.get("customer_id", "")
        if cid and cid in seen:
            continue  # 已在后台名单中
        participants.append({
            "nickname": s.get("nickname") or "匿名",
            "is_me": bool(customer_id) and cid == customer_id,
        })
    participants.sort(key=lambda p: 0 if p["is_me"] else 1)
    result["signup_count"] = len(participants)
    result["participants"] = participants
    result["signed_up"] = any(p["is_me"] for p in participants)
    return result


@router.post("/activities/{activity_id}/signup")
def signup_activity(activity_id: str, request: Request):
    """报名活动"""
    item = _find_activity(activity_id)
    if not item:
        raise HTTPException(status_code=404, detail="活动不存在")

    # 检查可见性
    visible_types = _get_visible_types()
    ct = item["data"].get("course_type", "")
    if not ct or ct not in visible_types:
        raise HTTPException(status_code=404, detail="活动不存在")

    # 获取客户信息
    customer_id = getattr(request.state, "customer_id", "") or getattr(request.state, "user_id", "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")

    customer = get_customer(customer_id)
    nickname = customer.nickname if customer else ""

    # 检查活动是否已开始或结束：date + start_time / end_time 已过则不允许报名
    act_date = item["data"].get("date", "")
    act_start = item["data"].get("start_time", "")
    act_end = item["data"].get("end_time", "")
    if act_date and act_start:
        from datetime import datetime as _dt
        now = _dt.now()
        try:
            # 有结束时间且已过 → "已结束"
            if act_end:
                act_end_dt = _dt.strptime(f"{act_date} {act_end}", "%Y-%m-%d %H:%M")
                if now >= act_end_dt:
                    raise HTTPException(status_code=400, detail="活动已结束，无法报名")
            # 开始时间已过 → "进行中"
            act_start_dt = _dt.strptime(f"{act_date} {act_start}", "%Y-%m-%d %H:%M")
            if now >= act_start_dt:
                raise HTTPException(status_code=400, detail="活动进行中，无法报名")
        except HTTPException:
            raise
        except Exception:
            pass

    # 检查是否已报名
    data = load_data(SIGNUPS_FILE)
    signups = data.get("signups", [])
    if isinstance(signups, dict):
        signups = list(signups.values())
    for s in signups:
        if s.get("activity_id") == activity_id and s.get("customer_id") == customer_id:
            raise HTTPException(status_code=409, detail="已报名该活动")

    # 创建报名记录
    signup_id = str(uuid.uuid4())
    signup = {
        "id": signup_id,
        "activity_id": activity_id,
        "customer_id": customer_id,
        "nickname": nickname,
        "created_at": datetime.now().isoformat(),
    }
    save_item(SIGNUPS_FILE, signup_id, signup)

    # 同步到邀约页面
    activity_date = item["data"].get("date", "")
    space_id = item["data"].get("space_id", "")
    if activity_date:
        from app.services import visit_service
        from app.models.visit import VisitRecordCreate
        existing = visit_service.list_visits(date=activity_date, customer_id=customer_id)
        if existing:
            visit = existing[0]
            if space_id and visit.space_id != space_id:
                visit_service.update_visit(visit.id, {"space_id": space_id})
        else:
            visit_data = VisitRecordCreate(
                visit_date=activity_date,
                customer_id=customer_id,
                space_id=space_id,
            )
            visit_service.create_visit(visit_data)

    # 同步到 PC 端活动参与者列表
    if activity_date and customer_id:
        activity_name = item["data"].get("activity_name") or item["data"].get("course_name", "")
        records = class_record_service.list_records(date=activity_date)
        for record in records:
            record_name = record.activity_name or record.course_name
            if record_name == activity_name and customer_id not in record.participant_ids:
                record.participant_ids.append(customer_id)
                class_record_service.update_participants(record.id, record.participant_ids)
                break

    return {"message": "报名成功", "signup_id": signup_id}


@router.post("/activities/{activity_id}/cancel-signup")
def cancel_signup(activity_id: str, request: Request):
    """取消报名"""
    customer_id = getattr(request.state, "customer_id", "") or getattr(request.state, "user_id", "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")

    # 删除 client_signups.json 中的报名记录
    from app.services.storage import load_data, delete_item
    signups_data = load_data(SIGNUPS_FILE)
    deleted = False
    for sid, s in signups_data.items():
        if isinstance(s, dict) and s.get("activity_id") == activity_id and s.get("customer_id") == customer_id:
            delete_item(SIGNUPS_FILE, sid)
            deleted = True
            break

    if not deleted:
        raise HTTPException(status_code=404, detail="未找到报名记录")

    # 从 PC 端 participant_ids 中移除
    item = _find_activity(activity_id)
    if item:
        activity_date = item["data"].get("date", "")
        activity_name = item["data"].get("activity_name") or item["data"].get("course_name", "")
        if activity_date and activity_name:
            records = class_record_service.list_records(date=activity_date)
            for record in records:
                record_name = record.activity_name or record.course_name
                if record_name == activity_name and customer_id in record.participant_ids:
                    record.participant_ids.remove(customer_id)
                    class_record_service.update_participants(record.id, record.participant_ids)
                    break

    return {"message": "已取消报名"}


# ---- 交易记录 / 活动记录 / 销卡记录 ----


@router.get("/transactions")
def get_transactions(request: Request):
    """交易记录 — 当前客户的购买记录"""
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    records = _build_payment_records(customer_id)
    return {"items": records, "total": len(records)}


@router.get("/activity-records")
def get_activity_records(request: Request):
    """活动记录 — 当前客户的参与活动记录"""
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    activities = _build_activities(customer_id)

    # 构建到场日期集合（仅 arrived=True 的记录）
    visit_dates = set()
    for v in visit_service.list_visits(customer_id=customer_id):
        if v.visit_date and v.arrived:
            visit_dates.add(v.visit_date)

    # 补充到场状态和活动时间
    for act in activities:
        act["arrived"] = act.get("date", "") in visit_dates
        _enrich_activity_time(act)

    return {"items": activities, "total": len(activities)}


def _enrich_activity_time(act: dict):
    """从原始活动数据补充 start_time / end_time"""
    session_id = act.get("session_id", "")
    act_type = act.get("type", "")
    if not session_id:
        return
    # 沙龙类型(课程记录)
    if act_type == "沙龙类型":
        record = class_record_service.get_record(session_id)
        if record:
            act["start_time"] = getattr(record, "start_time", "") or ""
            act["end_time"] = getattr(record, "end_time", "") or ""
    # 其他活动类型
    else:
        service_map = {
            "觉醒游戏": "group_case_session_service",
            "情绪释放": "emotional_release_session_service",
            "能量结": "energy_knot_session_service",
            "内部课程": "internal_course_session_service",
            "OH卡梳理": "oh_card_reading_session_service",
        }
        svc_name = service_map.get(act_type)
        if svc_name:
            import app.services as _svc
            svc = getattr(_svc, svc_name, None)
            if svc:
                for s in svc.list_sessions():
                    sid = s.id if hasattr(s, "id") else ""
                    if sid == session_id:
                        act["start_time"] = getattr(s, "start_time", "") or ""
                        act["end_time"] = getattr(s, "end_time", "") or ""
                        break


@router.get("/deductions")
def get_deductions(request: Request):
    """销卡记录 — 手动销卡 + 自动活动销卡"""
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")

    items = []

    # 手动销卡（PC 端操作的销卡记录）
    for d in project_deduction_service.list_deductions(customer_id=customer_id):
        items.append({
            "source": "manual",
            "project_type": d.project_type,
            "project_name": d.project_name,
            "count": d.count,
            "remaining_after": d.remaining_after,
            "deduction_date": d.deduction_date,
            "created_by": d.created_by,
        })

    # 自动活动销卡（参加活动自动扣减会员卡次数）
    raw_deductions = membership_card_service._deductions.get(customer_id, [])
    for item in raw_deductions:
        key = item.get("key", "") if isinstance(item, dict) else str(item)
        # key 格式: "class:{record.id}" 或其他活动类型
        items.append({
            "source": "activity",
            "project_type": "membership-cards",
            "project_name": _resolve_activity_name(key),
            "count": 1,
            "remaining_after": None,
            "deduction_date": _resolve_activity_date(key),
            "created_by": "",
        })

    items.sort(key=lambda x: x.get("deduction_date") or "", reverse=True)
    return {"items": items, "total": len(items)}


def _resolve_activity_name(key: str) -> str:
    """从活动 key 解析活动名称"""
    if not key:
        return "活动扣费"
    parts = key.split(":", 1)
    if len(parts) < 2:
        return "活动扣费"
    act_type, act_id = parts[0], parts[1]
    if act_type == "class":
        record = class_record_service.get_record(act_id)
        if record:
            return record.course_name or record.activity_name or "课程活动"
    return "活动扣费"


def _resolve_activity_date(key: str) -> str:
    """从活动 key 解析活动日期"""
    if not key:
        return ""
    parts = key.split(":", 1)
    if len(parts) < 2:
        return ""
    act_type, act_id = parts[0], parts[1]
    if act_type == "class":
        record = class_record_service.get_record(act_id)
        if record:
            return record.date or ""
    return ""
