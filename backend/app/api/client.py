import uuid
from datetime import date as date_cls
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.api.customer_detail import _build_activities, _build_payment_records, _build_purchase_summary
from app.models.activity_followup import ActivityFollowupCreate
from app.services import (
    activity_assignment_notification_service,
    activity_followup_service,
    class_record_service,
    course_type_service,
    emotional_release_session_service,
    energy_knot_session_service,
    group_case_session_service,
    internal_course_session_service,
    membership_card_service,
    project_deduction_service,
    space_service,
    visit_service,
)
from app.services.customer_service import get_customer, list_customers
from app.services.storage import load_data, save_item

router = APIRouter(prefix="/api/client", tags=["client"])

SIGNUPS_FILE = "client_signups.json"

OTHER_ACTIVITY_SERVICES = {
    "觉醒游戏": ("gcs", group_case_session_service),
    "情绪释放": ("ers", emotional_release_session_service),
    "能量结": ("eks", energy_knot_session_service),
}

SESSION_SERVICES = {
    "gcs": group_case_session_service,
    "ers": emotional_release_session_service,
    "eks": energy_knot_session_service,
    "ics": internal_course_session_service,
}

ACTIVITY_KEY_LABELS = {
    "class": "活动",
    "gcs": "觉醒游戏",
    "ers": "情绪释放",
    "eks": "能量结",
    "ics": "内部课程",
}


def _build_customer_map() -> dict:
    customers = list_customers()
    return {c.id: c for c in customers}


def _get_teacher_profiles(teacher_ids: list[str], customer_map: dict) -> list[dict]:
    profiles = []
    for tid in teacher_ids:
        customer = customer_map.get(tid)
        if customer:
            profiles.append({
                "name": customer.nickname or customer.name,
                "avatar_url": customer.avatar_url or "",
            })
    return profiles


def _get_space_map() -> tuple[dict[str, str], dict[str, str]]:
    space_map: dict[str, str] = {}
    room_map: dict[str, str] = {}
    for sp in space_service.get_all_spaces():
        space_map[sp.id] = sp.name
        for rm in sp.rooms:
            room_map[rm.id] = rm.name
    return space_map, room_map


def _session_item(activity_type: str, session, display_type: str) -> dict:
    d = session.model_dump(mode="json") if hasattr(session, "model_dump") else dict(session)
    d["course_type"] = display_type
    return {
        "type": activity_type,
        "id": d.get("id", ""),
        "data": d,
        "date": d.get("date", ""),
    }


def _aggregate_published_activities() -> list[dict]:
    """聚合所有已发布到客户端的活动场次"""
    items = []

    for r in class_record_service.list_records():
        d = r.model_dump(mode="json")
        if d.get("is_published", False):
            items.append({"type": "class", "id": d["id"], "data": d, "date": d.get("date", "")})

    for s in internal_course_session_service.list_sessions():
        d = s.model_dump(mode="json") if hasattr(s, "model_dump") else dict(s)
        if d.get("is_published", False):
            display_type = d.get("course_type") or "内部课程"
            items.append(_session_item("ics", s, display_type))

    for display_type, (activity_type, service) in OTHER_ACTIVITY_SERVICES.items():
        for session in service.list_sessions():
            d = session.model_dump(mode="json") if hasattr(session, "model_dump") else dict(session)
            if d.get("is_published", False):
                items.append(_session_item(activity_type, session, display_type))

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
    elif activity_type == "ics":
        name = d.get("course_name") or d.get("course_type", "")
    else:
        configured_name = d.get("course_type", "")
        owner_name = d.get("owner_name", "")
        name = d.get("name") or (f"{configured_name}·{owner_name}" if owner_name else configured_name)

    # 老师
    teacher_ids = d.get("teacher_ids", [])
    teacher_profiles = _get_teacher_profiles(teacher_ids, customer_map)
    leader_role_label = "老师" if teacher_profiles else ""
    achiever_activity_types = {"gcs", "ers"}
    if (
        activity_type in achiever_activity_types
        and d.get("achiever_id")
        and d["achiever_id"] in teacher_ids
    ):
        leader_role_label = "成就君"

    # 主持人（ics 用 host_id）
    if activity_type == "ics" and d.get("host_id"):
        host = customer_map.get(d["host_id"])
        if host:
            teacher_profiles = [{
                "name": host.nickname or host.name,
                "avatar_url": host.avatar_url or "",
            }]
    elif activity_type in SESSION_SERVICES and not teacher_profiles:
        facilitator_id = d.get("achiever_id") or d.get("host_id")
        facilitator = customer_map.get(facilitator_id) if facilitator_id else None
        facilitator_name = d.get("achiever_name") or d.get("host_name")
        if facilitator:
            teacher_profiles = [{
                "name": facilitator.nickname or facilitator.name,
                "avatar_url": facilitator.avatar_url or "",
            }]
        elif facilitator_name:
            teacher_profiles = [{"name": facilitator_name, "avatar_url": ""}]
        if teacher_profiles:
            leader_role_label = "成就君" if activity_type in achiever_activity_types else "老师"
    teacher_names = [profile["name"] for profile in teacher_profiles]

    # 觉醒游戏、情绪释放、能量结详情单独展示案主
    owner_name = ""
    if activity_type in {"gcs", "ers", "eks"}:
        owner_id = d.get("owner_id", "")
        owner = customer_map.get(owner_id) if owner_id else None
        owner_name = (owner.nickname or owner.name) if owner else d.get("owner_name", "")

    # 空间
    space_name = space_map.get(d.get("space_id", ""), "")
    room_name = room_map.get(d.get("room_id", ""), "")
    location = f"{space_name} {room_name}".strip() if space_name else ""

    # 简介
    description = (
        d.get("course_description", "")
        if activity_type == "eks"
        else d.get("course_description") or d.get("description", "")
    )

    # 列表图片和详情图片：从活动类型配置中获取
    ct_name = d.get("course_type", "")
    list_image = ""
    detail_images: list[str] = []
    if ct_name:
        for ct in course_type_service.list_course_types():
            if ct["name"] == ct_name:
                list_image = ct.get("list_image", "")
                detail_images = [url for url in (ct.get("detail_images") or []) if isinstance(url, str) and url]
                break

    try:
        membership_deduction_count = max(0, int(d.get("membership_deduction_count", 1)))
    except (TypeError, ValueError):
        membership_deduction_count = 1
    if activity_type in {"ics", "eks"} or d.get("is_public_welfare", False):
        membership_deduction_count = 0

    return {
        "id": item["id"],
        "type": activity_type,
        "name": name,
        "date": d.get("date", ""),
        "start_time": d.get("start_time", ""),
        "end_time": d.get("end_time", ""),
        "teacher_names": teacher_names,
        "teachers": teacher_profiles,
        "leader_role_label": leader_role_label,
        "owner_name": owner_name,
        "description": description,
        "activity_mode": d.get("activity_mode", "线下"),
        "is_public_welfare": d.get("is_public_welfare", False),
        "space_name": space_name,
        "room_name": room_name,
        "location": location,
        "course_type": ct_name,
        "list_image": list_image,
        "detail_images": detail_images,
        "membership_deduction_count": membership_deduction_count,
    }


def _load_signups(activity_id: str) -> list[dict]:
    """读取某活动的全部报名记录,按报名时间升序。兼容两种存储形态:按 uuid 单条存储 / 遗留的 signups 列表键"""
    rows = _load_all_signups()
    result = [row for row in rows if row.get("activity_id") == activity_id]
    result.sort(key=lambda s: s.get("created_at", ""))
    return result


def _load_all_signups() -> list[dict]:
    """一次读取全部小程序报名记录"""
    data = load_data(SIGNUPS_FILE)
    rows: list[dict] = []
    for v in data.values():
        if isinstance(v, dict) and v.get("activity_id"):
            rows.append(v)
        elif isinstance(v, list):
            rows.extend(s for s in v if isinstance(s, dict) and s.get("activity_id"))
    return rows


def _signup_map() -> dict[str, list[dict]]:
    """按活动 ID 聚合报名记录，避免列表逐条读取存储"""
    result: dict[str, list[dict]] = {}
    for signup in _load_all_signups():
        result.setdefault(signup["activity_id"], []).append(signup)
    return result


def _activity_role_ids(item: dict) -> dict[str, set[str]]:
    """返回活动中无需报名、默认参与的案主和老师 ID。"""
    data = item["data"]
    owner_ids = {data.get("owner_id")} - {None, ""}
    teacher_ids = {customer_id for customer_id in (data.get("teacher_ids") or []) if customer_id}

    # 与详情页展示的老师口径保持一致：内部课程以主持人为老师；
    # 其他活动未单独指定老师时，以带领者/主持人为老师。
    if item["type"] == "ics" and data.get("host_id"):
        teacher_ids.add(data["host_id"])
    elif item["type"] in SESSION_SERVICES and not teacher_ids:
        facilitator_id = data.get("achiever_id") or data.get("host_id")
        if facilitator_id:
            teacher_ids.add(facilitator_id)

    return {"owner": owner_ids, "teacher": teacher_ids}


def _activity_role_for_customer(item: dict, customer_id: str) -> str:
    """返回客户在活动中的固定身份，案主优先于老师。"""
    if not customer_id:
        return ""
    role_ids = _activity_role_ids(item)
    if customer_id in role_ids["owner"]:
        return "owner"
    if customer_id in role_ids["teacher"]:
        return "teacher"
    return ""


def _activity_role_label(role: str) -> str:
    return {"owner": "案主", "teacher": "老师"}.get(role, "")


def _customer_participates_in_activity(item: dict, customer_id: str) -> bool:
    """判断客户是否属于活动名单；用于本人访问未发布活动。"""
    if not customer_id:
        return False
    if _activity_role_for_customer(item, customer_id):
        return True
    if customer_id in (item["data"].get("participant_ids") or []):
        return True
    if any(
        customer_id in (group.get("member_ids") or [])
        for group in (item["data"].get("groups") or [])
    ):
        return True
    return any(
        signup.get("customer_id") == customer_id
        for signup in _load_signups(item["id"])
    )


def _activity_signup_count(item: dict, signups: list[dict]) -> int:
    """合并固定身份、后台参与者、分组成员和小程序报名并去重。"""
    seen = {cid for cid in (item["data"].get("participant_ids") or []) if cid}
    role_ids = _activity_role_ids(item)
    seen.update(role_ids["owner"])
    seen.update(role_ids["teacher"])
    for group in (item["data"].get("groups") or []):
        seen.update(cid for cid in (group.get("member_ids") or []) if cid)

    anonymous_count = 0
    for signup in signups:
        customer_id = signup.get("customer_id", "")
        if customer_id:
            seen.add(customer_id)
        else:
            anonymous_count += 1
    return len(seen) + anonymous_count


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
    """从全部活动服务中查找活动，返回统一 item"""
    record = class_record_service.get_record(activity_id)
    if record:
        d = record.model_dump(mode="json")
        return {"type": "class", "id": d["id"], "data": d, "date": d.get("date", "")}

    internal_session = internal_course_session_service.get_session(activity_id)
    if internal_session:
        display_type = internal_session.course_type or "内部课程"
        return _session_item("ics", internal_session, display_type)

    for display_type, (activity_type, service) in OTHER_ACTIVITY_SERVICES.items():
        session = service.get_session(activity_id)
        if session:
            return _session_item(activity_type, session, display_type)

    return None


def _sync_activity_participant(item: dict, customer_id: str, add: bool) -> None:
    """把客户端报名状态同步到对应 PC 活动的 participant_ids"""
    activity_type = item["type"]
    participant_ids = list(item["data"].get("participant_ids") or [])
    if add:
        if customer_id in participant_ids:
            return
        participant_ids.append(customer_id)
    else:
        if customer_id not in participant_ids:
            return
        participant_ids.remove(customer_id)

    if activity_type == "class":
        class_record_service.update_participants(item["id"], participant_ids)
        return

    service = SESSION_SERVICES.get(activity_type)
    if service:
        service.update_session(item["id"], {"participant_ids": participant_ids})


@router.get("/activities")
def list_activities(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    """客户端活动列表 — 返回全部已发布活动，可按日期范围筛选。"""
    items = _aggregate_published_activities()

    has_date_range = bool(start_date or end_date)
    if has_date_range:
        # 指定日期范围，用于客户端按周/按日查询
        if start_date:
            items = [i for i in items if i["date"] >= start_date]
        if end_date:
            items = [i for i in items if i["date"] <= end_date]

    # 注入名称
    customer_map = _build_customer_map()
    space_map, room_map = _get_space_map()

    signups_by_activity = _signup_map()
    formatted = []
    for item in items:
        activity = _format_activity(item, customer_map, space_map, room_map)
        activity["signup_count"] = _activity_signup_count(item, signups_by_activity.get(item["id"], []))
        formatted.append(activity)

    if has_date_range:
        # 日历范围内按日期、时间顺序展示
        formatted.sort(key=lambda x: (x["date"], x["start_time"] or ""))
    else:
        # 默认列表优先最近的未来活动；没有未来活动时紧接最近的历史活动
        today = date_cls.today().isoformat()
        upcoming = sorted(
            (item for item in formatted if item["date"] >= today),
            key=lambda x: (x["date"], x["start_time"] or ""),
        )
        past = sorted(
            (item for item in formatted if item["date"] < today),
            key=lambda x: (x["date"], x["start_time"] or ""),
            reverse=True,
        )
        formatted = upcoming + past

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

    customer_id = _current_customer_id(request)
    if (
        not item["data"].get("is_published", False)
        and not _customer_participates_in_activity(item, customer_id)
    ):
        raise HTTPException(status_code=404, detail="活动不存在")

    customer_map = _build_customer_map()
    space_map, room_map = _get_space_map()
    result = _format_activity(item, customer_map, space_map, room_map)

    # 参与者 = 案主/老师 ∪ 后台维护的 participant_ids(+分组成员) ∪ 小程序报名记录
    # 当前用户(若已登录)排最前并标记 is_me
    member_ids: list[str] = []
    seen: set[str] = set()

    role_ids = _activity_role_ids(item)
    for role in ("owner", "teacher"):
        for cid in sorted(role_ids[role]):
            if cid and cid not in seen:
                seen.add(cid)
                member_ids.append(cid)
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
            "role": _activity_role_for_customer(item, cid) or "participant",
        })
    for s in _load_signups(activity_id):
        cid = s.get("customer_id", "")
        if cid and cid in seen:
            continue  # 已在后台名单中
        if cid:
            seen.add(cid)
        participants.append({
            "nickname": s.get("nickname") or "匿名",
            "is_me": bool(customer_id) and cid == customer_id,
            "role": "participant",
        })
    participants.sort(key=lambda p: 0 if p["is_me"] else 1)
    participation_role = _activity_role_for_customer(item, customer_id)
    result["signup_count"] = len(participants)
    result["participants"] = participants
    result["signed_up"] = any(p["is_me"] for p in participants)
    result["participation_locked"] = bool(participation_role)
    result["participation_role"] = participation_role
    result["participation_role_label"] = _activity_role_label(participation_role)
    return result


@router.post("/activities/{activity_id}/signup")
def signup_activity(activity_id: str, request: Request):
    """报名活动"""
    item = _find_activity(activity_id)
    if not item:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not item["data"].get("is_published", False):
        raise HTTPException(status_code=404, detail="活动不存在")

    # 获取客户信息
    customer_id = getattr(request.state, "customer_id", "") or getattr(request.state, "user_id", "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")

    participation_role = _activity_role_for_customer(item, customer_id)
    if participation_role:
        role_label = _activity_role_label(participation_role)
        raise HTTPException(status_code=409, detail=f"你是本场{role_label}，已自动参与，无需报名")

    customer = get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(status_code=404, detail="客户不存在")
    nickname = customer.nickname or ""

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
    for s in _load_signups(activity_id):
        if s.get("customer_id") == customer_id:
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
        from app.models.visit import VisitRecordCreate
        from app.services import visit_service

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

    # 同步到对应 PC 活动的参与者列表
    if activity_date and customer_id:
        previous_member_ids = activity_assignment_notification_service.get_member_ids(item["data"])
        _sync_activity_participant(item, customer_id, add=True)
        updated_item = _find_activity(activity_id)
        if updated_item:
            activity_assignment_notification_service.notify_new_assignments(
                updated_item["type"],
                {"id": updated_item["id"], **updated_item["data"]},
                previous_member_ids=previous_member_ids,
            )

    return {"message": "报名成功", "signup_id": signup_id}


@router.post("/activities/{activity_id}/cancel-signup")
def cancel_signup(activity_id: str, request: Request):
    """取消报名"""
    customer_id = getattr(request.state, "customer_id", "") or getattr(request.state, "user_id", "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")

    item = _find_activity(activity_id)
    if not item:
        raise HTTPException(status_code=404, detail="活动不存在")

    participation_role = _activity_role_for_customer(item, customer_id)
    if participation_role:
        role_label = _activity_role_label(participation_role)
        raise HTTPException(status_code=409, detail=f"你是本场{role_label}，无法取消参与")

    # 删除 client_signups.json 中的报名记录
    from app.services.storage import delete_item, load_data
    signups_data = load_data(SIGNUPS_FILE)
    deleted = False
    for sid, s in signups_data.items():
        if isinstance(s, dict) and s.get("activity_id") == activity_id and s.get("customer_id") == customer_id:
            delete_item(SIGNUPS_FILE, sid)
            deleted = True
            break

    if not deleted:
        raise HTTPException(status_code=404, detail="未找到报名记录")

    # 从对应 PC 活动的 participant_ids 中移除
    _sync_activity_participant(item, customer_id, add=False)

    return {"message": "已取消报名"}


# ---- 交易记录 / 活动记录 / 销卡记录 ----


def _build_client_purchased_projects(
    customer_id: str,
    purchase_summary: list[dict] | None = None,
) -> list[dict]:
    """返回客户端展示用的已购项目及当前权益信息。"""
    today = date_cls.today().isoformat()
    payment_dates: dict[str, str] = {}
    for payment in _build_payment_records(customer_id):
        effective_date = payment.get("effective_date") or payment.get("created_at") or ""
        project_type = payment.get("type", "")
        if effective_date and (
            project_type not in payment_dates
            or effective_date < payment_dates[project_type]
        ):
            payment_dates[project_type] = effective_date

    projects = []
    summary_items = purchase_summary if purchase_summary is not None else _build_purchase_summary(customer_id)
    for item in summary_items:
        project_type = item.get("type", "")
        project_name = item.get("name") or project_type
        if project_type == "会员卡" and not item.get("name"):
            continue
        if item.get("voided"):
            continue

        effective_date = item.get("effective_date") or payment_dates.get(project_type, "")
        expiry_date = item.get("expiry_date") or ""
        if expiry_date and expiry_date < today:
            status = "expired"
        elif effective_date and effective_date > today:
            status = "pending"
        else:
            status = "active"
        remaining = item.get("remaining")
        if remaining in (None, "-", "不限"):
            remaining = "不限次"
        elif isinstance(remaining, (int, float)):
            remaining = int(remaining)

        projects.append({
            "key": f"{project_type}:{project_name}:{len(projects)}",
            "type": project_type,
            "name": project_name,
            "status": status,
            "remaining": remaining,
            "total": item.get("total_purchased"),
            "effective_date": effective_date,
            "expiry_date": expiry_date,
        })
    status_order = {"active": 0, "pending": 1, "expired": 2}
    projects.sort(key=lambda project: (
        status_order.get(project["status"], 9),
        project["expiry_date"] or "9999-12-31",
        project["name"],
    ))
    return projects


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
    """活动记录 — 当前客户参与的全部活动，不受发布状态限制。"""
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    activities = _build_activities(customer_id)
    followups = {
        record.activity_key: record
        for record in activity_followup_service.list_followups(customer_id)
    }

    # 构建到场日期集合（仅 arrived=True 的记录）
    visit_dates = set()
    for v in visit_service.list_visits(customer_id=customer_id):
        if v.visit_date and v.arrived:
            visit_dates.add(v.visit_date)

    # 补充到场状态和活动时间
    for act in activities:
        act["arrived"] = act.get("date", "") in visit_dates
        _enrich_activity_time(act)
        followup = followups.get(act["activity_key"])
        act["has_followup"] = followup is not None
        act["followup_content"] = followup.content if followup else ""

    return {"items": activities, "total": len(activities)}


@router.get("/activity-followups")
def get_activity_followups(request: Request):
    """当前客户的活动回访记录。"""
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    records = activity_followup_service.list_followups(customer_id)
    return {
        "items": [record.model_dump(mode="json") for record in records],
        "total": len(records),
    }


@router.post("/activity-followups")
def save_activity_followup(data: ActivityFollowupCreate, request: Request):
    """新增或修改当前客户对某场活动的回访内容。"""
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")

    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="请填写回访内容")

    activity = next(
        (
            item
            for item in _build_activities(customer_id)
            if item.get("activity_type") == data.activity_type
            and item.get("session_id") == data.session_id
        ),
        None,
    )
    if not activity:
        raise HTTPException(status_code=404, detail="未找到对应的活动记录")

    _enrich_activity_time(activity)
    return activity_followup_service.upsert_followup(
        customer_id=customer_id,
        activity=activity,
        content=content,
    )


@router.get("/remaining")
def get_remaining(request: Request):
    """当前会员卡次数 — 与 PC 端按有效期匹配后的卡次统计口径一致。"""
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")
    membership = next(
        (item for item in _build_purchase_summary(customer_id) if item.get("type") == "会员卡"),
        {},
    )
    current_remaining = membership.get("current_remaining", 0)
    return {
        "remaining": None if current_remaining == "不限" else current_remaining,
        "current_total": membership.get("current_total", 0),
        "debt_count": membership.get("debt_count", 0),
    }


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


def _build_client_deduction_items(customer_id: str) -> list[dict]:
    """构建客户端销卡记录，供销卡页和消息通知共用。"""
    items = []
    activity_roles = {
        activity["activity_key"]: activity.get("role", "")
        for activity in _build_activities(customer_id)
    }
    arrived_dates = {
        visit.visit_date
        for visit in visit_service.list_visits(customer_id=customer_id)
        if visit.arrived and not visit.is_deleted
    }

    # 手动销卡（PC 端操作的销卡记录）
    for d in project_deduction_service.list_deductions(customer_id=customer_id):
        items.append({
            "source_id": f"manual:{d.id}",
            "source_created_at": d.created_at.isoformat(),
            "source": "manual",
            "project_type": d.project_type,
            "project_name": d.project_name,
            "benefit_name": d.project_name,
            "benefit_type": "manual",
            "count": d.count,
            "remaining_after": d.remaining_after,
            "deduction_date": d.deduction_date,
            "reason": d.reason or "后台手工销卡",
            "created_by": d.created_by,
            "activity_role": "",
        })

    # 活动会员权益使用：内部课程场次免费，不进入销卡记录
    raw_deductions = membership_card_service.list_activity_usage_records(customer_id)
    for item in raw_deductions:
        key = item.get("key", "") if isinstance(item, dict) else str(item)
        activity = _resolve_activity_usage(key)
        if (
            not activity
            or activity["activity_type"] == "ics"
            or activity["date"] not in arrived_dates
        ):
            continue
        benefit_name, benefit_type = _resolve_usage_benefit(item)
        remaining_after = item.get("remaining_after") if isinstance(item, dict) else None
        activity_key = key.split("#unit=", 1)[0]
        items.append({
            "source_id": f"activity:{key}",
            "source_created_at": item.get("deducted_at") or f"{activity['date']}T12:00:00+00:00",
            "source": "activity",
            "project_type": "membership-cards",
            "activity_type": activity["activity_type"],
            "project_name": activity["name"],
            "benefit_name": benefit_name,
            "benefit_type": benefit_type,
            "count": 1,
            "remaining_after": remaining_after,
            "deduction_date": activity["date"],
            "reason": f"参加{activity['type_label']}",
            "created_by": "",
            "activity_role": activity_roles.get(activity_key, ""),
        })

    # 没有可用会员卡/内部课程权益时产生的预支扣卡，也属于真实销卡流水。
    for item in membership_card_service.list_debt_activity_usage_records(customer_id):
        key = item.get("key", "")
        activity = _resolve_activity_usage(key)
        if not activity or activity["date"] not in arrived_dates:
            continue
        activity_key = key.split("#unit=", 1)[0]
        items.append({
            "source_id": f"debt:{key}",
            "source_created_at": f"{activity['date']}T12:00:00+00:00",
            "source": "activity",
            "project_type": "membership-cards",
            "activity_type": activity["activity_type"],
            "project_name": activity["name"],
            "benefit_name": item["benefit_name"],
            "benefit_type": item["benefit_type"],
            "count": 1,
            "remaining_after": item["remaining_after"],
            "deduction_date": activity["date"],
            "reason": f"参加{activity['type_label']}，无可用权益形成欠卡",
            "created_by": "",
            "activity_role": activity_roles.get(activity_key, ""),
        })

    items.extend(_build_special_project_usage_records(customer_id))
    items.sort(
        key=lambda x: (
            x.get("deduction_date") or "",
            x.get("source_created_at") or "",
            x.get("source_id") or "",
        ),
        reverse=True,
    )
    return items


@router.get("/deductions")
def get_deductions(request: Request, response: Response):
    """销卡记录 — 后台手工销卡 + 活动会员权益使用 + 专项项目使用"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    customer_id = _current_customer_id(request)
    if not customer_id:
        raise HTTPException(status_code=401, detail="请先登录")

    purchase_summary = _build_purchase_summary(customer_id)
    items = _build_client_deduction_items(customer_id)
    projects = _build_client_purchased_projects(customer_id, purchase_summary)
    return {
        "purchase_summary": purchase_summary,
        "projects": projects,
        "items": items,
        "total": len(items),
    }


def _resolve_activity_usage(key: str) -> dict | None:
    """解析所有活动类型的名称和日期。"""
    if not key:
        return None
    parts = key.split(":", 1)
    if len(parts) < 2:
        return None
    act_type, act_id = parts[0], parts[1].split("#unit=", 1)[0]
    if act_type == "class":
        record = class_record_service.get_record(act_id)
        if record:
            return {
                "name": record.activity_name or record.course_name or record.course_type or "课程活动",
                "date": record.date or "",
                "type_label": record.course_type or "活动",
                "activity_type": "class",
            }
        return None

    service = SESSION_SERVICES.get(act_type)
    session = service.get_session(act_id) if service else None
    if not session:
        return None
    type_label = ACTIVITY_KEY_LABELS.get(act_type, "活动")
    name = (
        getattr(session, "name", "")
        or getattr(session, "course_name", "")
        or type_label
    )
    return {
        "name": name,
        "date": getattr(session, "date", "") or "",
        "type_label": type_label,
        "activity_type": act_type,
    }


def _resolve_usage_benefit(item: dict) -> tuple[str, str]:
    """返回活动实际使用的卡或内部课程权益。"""
    benefit_name = item.get("benefit_name", "")
    benefit_type = item.get("benefit_type", "")
    card_id = item.get("card_id")
    if not benefit_name and card_id:
        card = membership_card_service.get_card(card_id)
        if card:
            benefit_name = card.card_type
            benefit_type = benefit_type or (
                "unlimited_card" if card.remaining_count is None else "count_card"
            )
    if not benefit_name:
        benefit_name = "历史会员权益（未记录卡种）"
    return benefit_name, benefit_type or "legacy"


def _build_special_project_usage_records(customer_id: str) -> list[dict]:
    """将专项项目案主已到场后的真实使用转换为销卡记录。"""
    configs = [
        ("group-cases", "觉醒游戏", group_case_session_service),
        ("emotional-releases", "情绪释放", emotional_release_session_service),
        ("energy-knots", "能量结", energy_knot_session_service),
    ]
    purchased_counts = {
        item.get("type"): item.get("total_purchased", 0)
        for item in _build_purchase_summary(customer_id)
    }
    manual_deductions = project_deduction_service.list_deductions(customer_id=customer_id)
    records = []
    for project_type, type_label, service in configs:
        total_purchased = purchased_counts.get(type_label, 0)
        running_remaining = (
            int(total_purchased)
            if isinstance(total_purchased, (int, float))
            else 0
        )
        timeline = []

        # 手工销卡也会影响后续活动发生时的历史余额，但它本身仍由上层单独展示。
        for deduction in manual_deductions:
            if deduction.project_type != project_type:
                continue
            timeline.append({
                "kind": "manual",
                "date": deduction.deduction_date or "",
                "created_at": deduction.created_at.isoformat(),
                "id": deduction.id,
                "count": deduction.count,
            })

        for session in service.list_sessions():
            if (
                session.owner_id != customer_id
                or not visit_service.is_customer_arrived(session.date, customer_id)
            ):
                continue
            count = (
                energy_knot_session_service.get_session_deduction_count(session, customer_id)
                if project_type == "energy-knots"
                else 1
            )
            if count <= 0:
                continue
            timeline.append({
                "kind": "activity",
                "date": session.date or "",
                "created_at": session.created_at.isoformat(),
                "id": session.id,
                "count": count,
                "session": session,
            })

        timeline.sort(key=lambda item: (item["date"], item["created_at"], item["id"]))
        for event in timeline:
            running_remaining -= event["count"]
            if event["kind"] != "activity":
                continue

            session = event["session"]
            is_debt = running_remaining < 0
            records.append({
                "source_id": f"special:{project_type}:{session.id}",
                "source_created_at": session.created_at.isoformat(),
                "source": "project_activity",
                "project_type": project_type,
                "project_name": getattr(session, "name", "") or type_label,
                "benefit_name": "预支扣卡" if is_debt else f"{type_label}次数",
                "benefit_type": "unpaid_special_project" if is_debt else "special_project",
                "count": event["count"],
                "remaining_after": running_remaining,
                "deduction_date": session.date,
                "reason": f"案主已到场，使用{type_label}",
                "created_by": "",
                "activity_role": "案主",
            })
    return records
