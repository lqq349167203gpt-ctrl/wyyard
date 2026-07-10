import uuid
from datetime import date as date_cls, datetime
from fastapi import APIRouter, HTTPException, Query, Request
from app.services import (
    class_record_service,
    course_type_service,
    internal_course_session_service,
    space_service,
)
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
        name = d.get("activity_name") or d.get("course_name", "")
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


def _count_signups(activity_id: str) -> int:
    """统计活动报名人数"""
    data = load_data(SIGNUPS_FILE)
    signups = data.get("signups", [])
    if isinstance(signups, dict):
        signups = list(signups.values())
    return len([s for s in signups if s.get("activity_id") == activity_id])


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
):
    """客户端活动列表 — 只返回未来活动，按日期升序"""
    visible_types = _get_visible_types()
    if not visible_types:
        return {"items": [], "total": 0, "page": 1, "page_size": 20, "total_pages": 0}

    items = _aggregate_visible_activities(visible_types)

    # 只保留未来活动（今天及以后）
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
def get_activity(activity_id: str):
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
    result["signup_count"] = _count_signups(activity_id)
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

    return {"message": "报名成功", "signup_id": signup_id}
