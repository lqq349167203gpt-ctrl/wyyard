import asyncio
import contextvars
import json
from datetime import datetime, timedelta, timezone

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

from app.config.settings import settings
from app.models.operation_log import OperationLogCreate
from app.services import (
    class_record_service,
    emotional_release_session_service,
    energy_knot_session_service,
    group_case_session_service,
    internal_course_session_service,
    oh_card_reading_session_service,
    operation_log_service,
)
from app.services.activity_ai_config_service import get_config as get_activity_ai_config
from app.services.miniapp_ai_config_service import get_config as get_miniapp_ai_config
from app.services.voice_parser import _find_customer_from_instruction, render_prompt, search_customer_candidates
from app.utils.cn_datetime import date_context_block, normalize_time, parse_anchor, resolve_date

TZ = timezone(timedelta(hours=8))

# 活动类型映射
TYPE_MAP = {
    "class": {
        "label": "沙龙",
        "service": class_record_service,
        "model_module": "app.models.class_record",
        "model_name": "ClassRecordCreate",
    },
    "gcs": {
        "label": "觉醒",
        "service": group_case_session_service,
        "model_module": "app.models.group_case_session",
        "model_name": "GroupCaseSessionCreate",
    },
    "ers": {
        "label": "情绪释放",
        "service": emotional_release_session_service,
        "model_module": "app.models.emotional_release_session",
        "model_name": "EmotionalReleaseSessionCreate",
    },
    "eks": {
        "label": "能量结",
        "service": energy_knot_session_service,
        "model_module": "app.models.energy_knot_session",
        "model_name": "EnergyKnotSessionCreate",
    },
    "ics": {
        "label": "内部课程",
        "service": internal_course_session_service,
        "model_module": "app.models.internal_course_session",
        "model_name": "InternalCourseSessionCreate",
    },
    "ocr": {
        "label": "OH卡",
        "service": oh_card_reading_session_service,
        "model_module": "app.models.oh_card_reading_session",
        "model_name": "OhCardReadingSessionCreate",
    },
}


def _now_hm():
    return datetime.now(TZ).strftime("%H:%M")


def _log_activity(content: str, method: str = "POST"):
    try:
        ctx = _ctx_var.get()
        extra = {"method": method, "path": "/api/voice/activity-chat"}
        if ctx.get("operator"):
            extra["operator"] = ctx["operator"]
        date = ctx.get("date", "")
        space_id = ctx.get("space_id", "")
        suffix_parts = []
        if date:
            suffix_parts.append(date)
        if space_id:
            from app.services import space_service
            space = space_service.get_space(space_id)
            if space:
                suffix_parts.append(space.name)
        if suffix_parts:
            content = f"{content}（{'，'.join(suffix_parts)}）"
        operation_log_service.create_log(
            OperationLogCreate(section="课表", content=content),
            extra=extra,
        )
    except Exception as e:
        print(f"[activity_chat] 写操作日志失败: {e}")


def _find_all_activities(date: str, space_id: str = ""):
    """查询所有 6 种活动类型，返回统一格式列表"""
    results = []
    sid = space_id or None

    # 沙龙
    for r in class_record_service.list_records(date=date):
        if sid and r.space_id and r.space_id != sid:
            continue
        results.append({
            "type": "class", "type_label": "沙龙",
            "id": r.id, "name": r.activity_name or r.course_name,
            "start_time": r.start_time, "end_time": r.end_time,
            "teacher_ids": r.teacher_ids, "participant_ids": r.participant_ids,
            "is_public_welfare": r.is_public_welfare,
        })

    # 觉醒
    for r in group_case_session_service.list_sessions(date=date):
        if sid and r.space_id and r.space_id != sid:
            continue
        results.append({
            "type": "gcs", "type_label": "觉醒",
            "id": r.id, "name": r.name or f"觉醒·{r.owner_name}",
            "start_time": r.start_time, "end_time": r.end_time,
            "teacher_ids": r.teacher_ids, "participant_ids": r.participant_ids,
            "owner_name": r.owner_name,
        })

    # 情绪释放
    for r in emotional_release_session_service.list_sessions(date=date):
        if sid and r.space_id and r.space_id != sid:
            continue
        results.append({
            "type": "ers", "type_label": "情绪释放",
            "id": r.id, "name": r.name or f"情绪释放·{r.owner_name}",
            "start_time": r.start_time, "end_time": r.end_time,
            "teacher_ids": r.teacher_ids, "participant_ids": r.participant_ids,
            "owner_name": r.owner_name,
        })

    # 能量结
    for r in energy_knot_session_service.list_sessions(date=date):
        if sid and r.space_id and r.space_id != sid:
            continue
        results.append({
            "type": "eks", "type_label": "能量结",
            "id": r.id, "name": r.name or f"能量结·{r.owner_name}",
            "start_time": r.start_time, "end_time": r.end_time,
            "teacher_ids": r.teacher_ids, "participant_ids": r.participant_ids,
            "owner_name": r.owner_name,
        })

    # 内部课程
    for r in internal_course_session_service.list_sessions(date=date):
        if sid and r.space_id and r.space_id != sid:
            continue
        results.append({
            "type": "ics", "type_label": "内部课程",
            "id": r.id, "name": r.course_name,
            "start_time": r.start_time, "end_time": r.end_time,
            "teacher_ids": r.teacher_ids, "participant_ids": r.participant_ids,
        })

    # OH卡
    for r in oh_card_reading_session_service.list_sessions(date=date):
        if sid and r.space_id and r.space_id != sid:
            continue
        results.append({
            "type": "ocr", "type_label": "OH卡",
            "id": r.id, "name": r.name or f"OH卡·{r.owner_name}",
            "start_time": r.start_time, "end_time": r.end_time,
            "teacher_ids": r.teacher_ids, "participant_ids": r.participant_ids,
            "owner_name": r.owner_name,
        })

    results.sort(key=lambda x: x.get("start_time") or "")
    return results


def _search_similar_names(keyword: str, limit: int = 5) -> list:
    """模糊搜索客户昵称（拼音 + 字面相似度），返回相似名字列表"""
    return search_customer_candidates(keyword, limit)


def _resolve_ctx_date(raw: str) -> str | None:
    """解析工具收到的日期参数：空则用上下文锚点日期；
    原始表达（如「上周五」「7月20号」）由确定性解析器换算，非法返回 None。"""
    ctx = _ctx_var.get()
    raw = (raw or "").strip()
    if not raw:
        return ctx.get("date") or None
    return resolve_date(raw, parse_anchor(ctx.get("date")))


def _invalid_date_json(raw: str) -> str:
    return json.dumps(
        {"ok": False, "reason": "invalid_date", "value": raw, "anchor": _ctx_var.get().get("date", "")},
        ensure_ascii=False,
    )


def _invalid_time_json(raw: str) -> str:
    return json.dumps({"ok": False, "reason": "invalid_time", "value": raw}, ensure_ascii=False)


def _find_activity_by_name(name: str, date: str, space_id: str = ""):
    """按名称模糊匹配活动。优先精确匹配，再子串匹配。

    返回 (activity, candidates):
      - 唯一匹配: (activity, None)
      - 无匹配:   (None, None)
      - 多匹配:   (None, candidates_list)  — 调用方应追问用户
    """
    activities = _find_all_activities(date, space_id)
    name_lower = name.lower()
    # 精确匹配
    for a in activities:
        if a["name"] and a["name"].lower() == name_lower:
            return a, None
    # 子串匹配
    substring_matches = []
    for a in activities:
        if a["name"] and (name_lower in a["name"].lower() or a["name"].lower() in name_lower):
            substring_matches.append(a)
    if len(substring_matches) == 1:
        return substring_matches[0], None
    if len(substring_matches) > 1:
        return None, substring_matches
    return None, None


def _get_teacher_names(teacher_ids: list) -> list:
    """从 customer_service 获取老师昵称"""
    from app.services import customer_service
    names = []
    for tid in teacher_ids:
        c = customer_service.get_customer(tid)
        if c:
            names.append(c.nickname)
    return names


def _get_participant_names(participant_ids: list) -> list:
    """从 customer_service 获取参与者昵称"""
    from app.services import customer_service
    names = []
    for pid in participant_ids:
        c = customer_service.get_customer(pid)
        if c:
            names.append(c.nickname)
    return names


def _format_activity_detail(activities: list) -> str:
    """格式化活动详情（含参与者姓名），用于注入系统提示词"""
    if not activities:
        return "当天没有活动安排。"
    lines = []
    for a in activities:
        pw = "（公益）" if a.get("is_public_welfare") else ""
        time_str = ""
        if a.get("start_time"):
            time_str = f" {a['start_time']}"
            if a.get("end_time"):
                time_str += f"-{a['end_time']}"
        teacher_str = ""
        if a.get("teacher_ids"):
            names = _get_teacher_names(a["teacher_ids"])
            if names:
                teacher_str = f"  老师：{'、'.join(names)}"
        owner = f"  案主：{a['owner_name']}" if a.get("owner_name") else ""
        pids = a.get("participant_ids") or []
        pnames = _get_participant_names(pids) if pids else []
        participant_str = f"  参与者（{len(pnames)}人）：{'、'.join(pnames)}" if pnames else "  参与者：暂无"
        lines.append(f"- [{a['type_label']}] {a['name']}{pw}{time_str}{teacher_str}{owner}{participant_str}")
    return "\n".join(lines)


def _format_activity_list(activities: list) -> str:
    """格式化活动列表为可读文字"""
    if not activities:
        return "当天没有活动安排。"
    lines = []
    for a in activities:
        time_str = ""
        if a["start_time"]:
            time_str = f" {a['start_time']}"
            if a.get("end_time"):
                time_str += f"-{a['end_time']}"
        teacher_str = ""
        if a["teacher_ids"]:
            names = _get_teacher_names(a["teacher_ids"])
            if names:
                teacher_str = f"，老师：{'、'.join(names)}"
        participants = len(a.get("participant_ids", []))
        pw = "（公益）" if a.get("is_public_welfare") else ""
        owner = f"，案主：{a['owner_name']}" if a.get("owner_name") else ""
        lines.append(f"- [{a['type_label']}] {a['name']}{pw}{time_str}{teacher_str}{owner}，{participants}人参与")
    return "\n".join(lines)


# ── 工具定义 ──────────────────────────────────────────────


@tool
def create_activity(
    activity_type: str,
    name: str,
    course_type: str = "",
    start_time: str = "",
    end_time: str = "",
    teacher_name: str = "",
    owner_name: str = "",
    is_public_welfare: bool = False,
    activity_date: str = "",
) -> str:
    """创建一个新的活动。注意：必须先确认活动类型和老师才能创建，不要自己猜测类型。

    Args:
        activity_type: 一级分类，可选值：class(沙龙), gcs(觉醒游戏), ers(情绪释放), eks(能量结), ics(内部课程), ocr(OH卡)
        name: 活动名称（如"颂钵"、"读书会"）
        course_type: 具体子类型名称（如"颂钵"、"读书会"、"疗愈师课程"），class 和 ics 类型必须填
        start_time: 开始时间，格式 HH:MM（如"14:00"），必须提供
        end_time: 结束时间，格式 HH:MM（如"16:00"）
        teacher_name: 老师/主持人昵称（如"小明"），必须提供
        owner_name: 案主昵称（觉醒、情绪释放、OH卡、能量结类型需要）
        is_public_welfare: 是否公益（沙龙类型可选，默认否）
        activity_date: 活动日期，可传用户原话（如"上周五"）或 YYYY-MM-DD，不填则用当前选中日期
    """
    ctx = _ctx_var.get()
    date = _resolve_ctx_date(activity_date)
    if not date:
        return _invalid_date_json(activity_date)
    space_id = ctx["space_id"]

    if activity_type not in TYPE_MAP:
        return json.dumps({"ok": False, "reason": "invalid_type", "type": activity_type}, ensure_ascii=False)

    # ── 必填校验与格式归一化（代码强制，不依赖 LLM 自觉）──
    if not (start_time or "").strip():
        return json.dumps({"ok": False, "reason": "missing_start_time", "name": name}, ensure_ascii=False)
    normalized_start = normalize_time(start_time)
    if not normalized_start:
        return _invalid_time_json(start_time)
    start_time = normalized_start

    if (end_time or "").strip():
        normalized_end = normalize_time(end_time)
        if not normalized_end:
            return _invalid_time_json(end_time)
        end_time = normalized_end

    if not (teacher_name or "").strip():
        return json.dumps({"ok": False, "reason": "missing_teacher", "name": name}, ensure_ascii=False)

    if activity_type in ("gcs", "ers", "eks", "ocr") and not (owner_name or "").strip():
        return json.dumps(
            {"ok": False, "reason": "missing_owner", "name": name, "type": TYPE_MAP[activity_type]["label"]},
            ensure_ascii=False,
        )

    if activity_type in ("class", "ics") and not (course_type or "").strip():
        return json.dumps(
            {"ok": False, "reason": "missing_course_type", "name": name, "type": TYPE_MAP[activity_type]["label"]},
            ensure_ascii=False,
        )

    # 查找老师
    teacher_ids = []
    if teacher_name:
        teacher = _find_customer_from_instruction(teacher_name)
        if not teacher:
            # 模糊搜索相似名字
            suggestions = _search_similar_names(teacher_name)
            result = {"ok": False, "reason": "teacher_not_found", "name": teacher_name}
            if suggestions:
                result["suggestions"] = suggestions
            return json.dumps(result, ensure_ascii=False)
        teacher_ids = [teacher["id"]]

    # 查找案主（如有）
    owner_id = ""
    owner_name_resolved = ""
    if owner_name:
        owner = _find_customer_from_instruction(owner_name)
        if not owner:
            suggestions = _search_similar_names(owner_name)
            result = {"ok": False, "reason": "owner_not_found", "name": owner_name}
            if suggestions:
                result["suggestions"] = suggestions
            return json.dumps(result, ensure_ascii=False)
        owner_id = owner["id"]
        owner_name_resolved = owner["nickname"]

    # 填充空间信息
    space_name = ""
    if space_id:
        from app.services import space_service
        space = space_service.get_space(space_id)
        if space:
            space_name = space.name

    try:
        if activity_type == "class":
            record = class_record_service.create_record(
                __import__("app.models.class_record", fromlist=["ClassRecordCreate"]).ClassRecordCreate(
                    date=date, start_time=start_time or None, end_time=end_time or None,
                    course_id="", course_name=name, course_type=course_type,
                    activity_name=name, teacher_ids=teacher_ids,
                    is_public_welfare=is_public_welfare,
                    space_id=space_id, space_name=space_name,
                )
            )
            _log_activity(f"新增沙龙 {name}", method="POST")
            return json.dumps({"ok": True, "action": "create", "type": "沙龙", "name": name, "id": record.id}, ensure_ascii=False)

        elif activity_type == "gcs":
            record = group_case_session_service.create_session(
                __import__("app.models.group_case_session", fromlist=["GroupCaseSessionCreate"]).GroupCaseSessionCreate(
                    date=date, start_time=start_time or None, end_time=end_time or None,
                    name=name, owner_id=owner_id, owner_name=owner_name_resolved,
                    teacher_ids=teacher_ids,
                    space_id=space_id, space_name=space_name,
                )
            )
            _log_activity(f"新增觉醒 {name}", method="POST")
            return json.dumps({"ok": True, "action": "create", "type": "觉醒", "name": name, "id": record.id}, ensure_ascii=False)

        elif activity_type == "ers":
            record = emotional_release_session_service.create_session(
                __import__("app.models.emotional_release_session", fromlist=["EmotionalReleaseSessionCreate"]).EmotionalReleaseSessionCreate(
                    date=date, start_time=start_time or None, end_time=end_time or None,
                    name=name, owner_id=owner_id, owner_name=owner_name_resolved,
                    teacher_ids=teacher_ids,
                    space_id=space_id, space_name=space_name,
                )
            )
            _log_activity(f"新增情绪释放 {name}", method="POST")
            return json.dumps({"ok": True, "action": "create", "type": "情绪释放", "name": name, "id": record.id}, ensure_ascii=False)

        elif activity_type == "eks":
            record = energy_knot_session_service.create_session(
                __import__("app.models.energy_knot_session", fromlist=["EnergyKnotSessionCreate"]).EnergyKnotSessionCreate(
                    date=date, start_time=start_time or None, end_time=end_time or None,
                    name=name, owner_id=owner_id, owner_name=owner_name_resolved,
                    teacher_ids=teacher_ids,
                    space_id=space_id, space_name=space_name,
                )
            )
            _log_activity(f"新增能量结 {name}", method="POST")
            return json.dumps({"ok": True, "action": "create", "type": "能量结", "name": name, "id": record.id}, ensure_ascii=False)

        elif activity_type == "ics":
            record = internal_course_session_service.create_session(
                __import__("app.models.internal_course_session", fromlist=["InternalCourseSessionCreate"]).InternalCourseSessionCreate(
                    date=date, start_time=start_time or None, end_time=end_time or None,
                    course_name=name, teacher_ids=teacher_ids,
                    space_id=space_id, space_name=space_name,
                )
            )
            _log_activity(f"新增内部课程 {name}", method="POST")
            return json.dumps({"ok": True, "action": "create", "type": "内部课程", "name": name, "id": record.id}, ensure_ascii=False)

        elif activity_type == "ocr":
            record = oh_card_reading_session_service.create_session(
                __import__("app.models.oh_card_reading_session", fromlist=["OhCardReadingSessionCreate"]).OhCardReadingSessionCreate(
                    date=date, start_time=start_time or None, end_time=end_time or None,
                    name=name, owner_id=owner_id, owner_name=owner_name_resolved,
                    teacher_ids=teacher_ids,
                    space_id=space_id, space_name=space_name,
                )
            )
            _log_activity(f"新增OH卡 {name}", method="POST")
            return json.dumps({"ok": True, "action": "create", "type": "OH卡", "name": name, "id": record.id}, ensure_ascii=False)

    except Exception as e:
        return json.dumps({"ok": False, "reason": "create_error", "error": str(e)[:200]}, ensure_ascii=False)

    return json.dumps({"ok": False, "reason": "unhandled"}, ensure_ascii=False)


@tool
def query_activities(activity_date: str = "") -> str:
    """查询某天的所有活动安排。

    Args:
        activity_date: 查询日期，可传用户原话（如"上周五"）或 YYYY-MM-DD，不填则用当前选中日期
    """
    date = _resolve_ctx_date(activity_date)
    if not date:
        return _invalid_date_json(activity_date)
    space_id = _ctx_var.get()["space_id"]
    activities = _find_all_activities(date, space_id)
    return json.dumps({"ok": True, "action": "query", "date": date, "count": len(activities), "text": _format_activity_list(activities)}, ensure_ascii=False)


@tool
def update_activity(activity_name: str, field: str, value: str) -> str:
    """修改活动的某个字段。

    Args:
        activity_name: 活动名称（用于查找活动）
        field: 要修改的字段，可选：start_time, end_time, name, teacher, owner
        value: 新值
    """
    ctx = _ctx_var.get()
    date = ctx["date"]
    space_id = ctx["space_id"]

    activity, candidates = _find_activity_by_name(activity_name, date, space_id)
    if not activity:
        if candidates:
            names = [c["name"] for c in candidates]
            return json.dumps({"ok": False, "reason": "ambiguous", "name": activity_name, "candidates": names}, ensure_ascii=False)
        all_activities = _find_all_activities(date, space_id)
        actual = [a["name"] for a in all_activities if a.get("name")]
        return json.dumps({"ok": False, "reason": "not_found", "name": activity_name, "actual_on_date": actual}, ensure_ascii=False)

    type_info = TYPE_MAP.get(activity["type"])
    if not type_info:
        return json.dumps({"ok": False, "reason": "unknown_type"}, ensure_ascii=False)

    service = type_info["service"]
    update_data = {}

    if field in ("start_time", "end_time"):
        normalized = normalize_time(value)
        if not normalized:
            return _invalid_time_json(value)
        update_data[field] = normalized
    elif field == "name":
        update_data[field] = value
    elif field == "teacher":
        teacher = _find_customer_from_instruction(value)
        if not teacher:
            return json.dumps({"ok": False, "reason": "teacher_not_found", "name": value}, ensure_ascii=False)
        update_data["teacher_ids"] = [teacher["id"]]
    elif field == "owner":
        owner = _find_customer_from_instruction(value)
        if not owner:
            return json.dumps({"ok": False, "reason": "owner_not_found", "name": value}, ensure_ascii=False)
        update_data["owner_id"] = owner["id"]
        update_data["owner_name"] = owner["nickname"]
    else:
        return json.dumps({"ok": False, "reason": "invalid_field", "field": field}, ensure_ascii=False)

    try:
        if activity["type"] == "class":
            result = service.update_record(activity["id"], update_data)
        else:
            result, _ = service.update_session(activity["id"], update_data)
        if not result:
            return json.dumps({"ok": False, "reason": "update_failed"}, ensure_ascii=False)
        _log_activity(f"修改{activity['type_label']} {activity['name']}：{field}={value}", method="PATCH")
        return json.dumps({"ok": True, "action": "update", "name": activity["name"], "field": field, "value": value}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"ok": False, "reason": "error", "error": str(e)[:200]}, ensure_ascii=False)


@tool
def remove_activity(activity_name: str) -> str:
    """删除一个活动。

    Args:
        activity_name: 活动名称（用于查找活动）
    """
    ctx = _ctx_var.get()
    date = ctx["date"]
    space_id = ctx["space_id"]

    activity, candidates = _find_activity_by_name(activity_name, date, space_id)
    if not activity:
        if candidates:
            names = [c["name"] for c in candidates]
            return json.dumps({"ok": False, "reason": "ambiguous", "name": activity_name, "candidates": names}, ensure_ascii=False)
        all_activities = _find_all_activities(date, space_id)
        actual = [a["name"] for a in all_activities if a.get("name")]
        return json.dumps({"ok": False, "reason": "not_found", "name": activity_name, "actual_on_date": actual}, ensure_ascii=False)

    type_info = TYPE_MAP.get(activity["type"])
    if not type_info:
        return json.dumps({"ok": False, "reason": "unknown_type"}, ensure_ascii=False)

    service = type_info["service"]
    try:
        ok = service.delete_record(activity["id"]) if activity["type"] == "class" else service.delete_session(activity["id"])
        if not ok:
            return json.dumps({"ok": False, "reason": "delete_failed"}, ensure_ascii=False)
        _log_activity(f"删除{activity['type_label']} {activity['name']}", method="DELETE")
        return json.dumps({"ok": True, "action": "remove", "name": activity["name"], "type": activity["type_label"]}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"ok": False, "reason": "error", "error": str(e)[:200]}, ensure_ascii=False)


@tool
def add_participant(activity_name: str, customer_name: str) -> str:
    """给活动添加参与者。只能添加当天到店名单里的人。

    Args:
        activity_name: 活动名称（用于查找活动）
        customer_name: 要添加的客户昵称（必须是当天到店名单里的人）
    """
    from app.services import visit_service

    ctx = _ctx_var.get()
    date = ctx["date"]
    space_id = ctx["space_id"]

    activity, candidates = _find_activity_by_name(activity_name, date, space_id)
    if not activity:
        if candidates:
            names = [c["name"] for c in candidates]
            return json.dumps({"ok": False, "reason": "ambiguous", "name": activity_name, "candidates": names}, ensure_ascii=False)
        all_activities = _find_all_activities(date, space_id)
        actual = [a["name"] for a in all_activities if a.get("name")]
        return json.dumps({"ok": False, "reason": "activity_not_found", "name": activity_name, "actual_on_date": actual}, ensure_ascii=False)

    # 获取当天到店名单
    visits = visit_service.list_visits(date, space_id=space_id if space_id else None)
    visit_customer_names = {v.nickname: v.customer_id for v in visits if v.nickname}

    # 从到店名单里找人（不是从客户库找）
    customer_id = visit_customer_names.get(customer_name)
    if not customer_id:
        # 模糊匹配
        name_lower = customer_name.lower()
        for nick, cid in visit_customer_names.items():
            if nick and (name_lower in nick.lower() or nick.lower() in name_lower):
                customer_id = cid
                customer_name = nick
                break

    if not customer_id:
        available = list(visit_customer_names.keys())
        return json.dumps({"ok": False, "reason": "not_in_visit_list", "name": customer_name, "available": available}, ensure_ascii=False)

    customer = {"id": customer_id, "nickname": customer_name}

    if customer["id"] in (activity.get("participant_ids") or []):
        return json.dumps({"ok": True, "action": "already_in", "activity": activity["name"], "name": customer["nickname"]}, ensure_ascii=False)

    new_ids = list(activity.get("participant_ids") or []) + [customer["id"]]
    type_info = TYPE_MAP.get(activity["type"])
    service = type_info["service"]

    try:
        if activity["type"] == "class":
            service.update_record(activity["id"], {"participant_ids": new_ids})
        else:
            service.update_session(activity["id"], {"participant_ids": new_ids})
        _log_activity(f"{activity['type_label']} {activity['name']}添加参与者 {customer['nickname']}", method="PATCH")
        return json.dumps({"ok": True, "action": "add_participant", "activity": activity["name"], "name": customer["nickname"]}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"ok": False, "reason": "error", "error": str(e)[:200]}, ensure_ascii=False)


@tool
def set_teacher(activity_name: str, teacher_name: str) -> str:
    """为活动设置或更换老师。

    Args:
        activity_name: 活动名称（用于查找活动）
        teacher_name: 老师/主持人昵称
    """
    ctx = _ctx_var.get()
    date = ctx["date"]
    space_id = ctx["space_id"]

    activity, candidates = _find_activity_by_name(activity_name, date, space_id)
    if not activity:
        if candidates:
            names = [c["name"] for c in candidates]
            return json.dumps({"ok": False, "reason": "ambiguous", "name": activity_name, "candidates": names}, ensure_ascii=False)
        all_activities = _find_all_activities(date, space_id)
        actual = [a["name"] for a in all_activities if a.get("name")]
        return json.dumps({"ok": False, "reason": "activity_not_found", "name": activity_name, "actual_on_date": actual}, ensure_ascii=False)

    teacher = _find_customer_from_instruction(teacher_name)
    if not teacher:
        return json.dumps({"ok": False, "reason": "teacher_not_found", "name": teacher_name}, ensure_ascii=False)

    type_info = TYPE_MAP.get(activity["type"])
    service = type_info["service"]

    try:
        if activity["type"] == "class":
            service.update_record(activity["id"], {"teacher_ids": [teacher["id"]]})
        else:
            service.update_session(activity["id"], {"teacher_ids": [teacher["id"]]})
        _log_activity(f"{activity['type_label']} {activity['name']}老师改为 {teacher['nickname']}", method="PATCH")
        return json.dumps({"ok": True, "action": "set_teacher", "activity": activity["name"], "name": teacher["nickname"]}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"ok": False, "reason": "error", "error": str(e)[:200]}, ensure_ascii=False)


TOOLS = [create_activity, query_activities, update_activity, remove_activity, add_participant, set_teacher]
TOOL_MAP = {t.name: t for t in TOOLS}

# 课表页面可用工具（不含客户创建，不属于课表页面的权限）
ACTIVITY_CHAT_TOOLS = [create_activity, query_activities, update_activity, remove_activity, add_participant, set_teacher]
ACTIVITY_CHAT_TOOL_MAP = {t.name: t for t in ACTIVITY_CHAT_TOOLS}

# 运行时上下文
_ctx_var = contextvars.ContextVar("activity_chat_ctx", default={"date": "", "space_id": "", "operator": ""})


async def activity_chat(message: str, history: list, date: str, space_id: str, operator: str = "") -> dict:
    """课表对话主入口。使用 LLM tool calling 理解意图并执行操作。"""
    anchor = parse_anchor(date)
    anchor_iso = anchor.isoformat()
    _ctx_var.set({"date": anchor_iso, "space_id": space_id, "operator": operator})

    prompt_config = get_activity_ai_config()
    model_config = get_miniapp_ai_config()
    api_key = model_config.api_key or settings.llm_api_key
    base_url = model_config.base_url or settings.llm_base_url
    model = model_config.model or settings.llm_model

    # 预加载当天活动数据（含参与者姓名），注入系统提示词
    all_activities = _find_all_activities(anchor_iso, space_id)
    activity_context = _format_activity_detail(all_activities)

    # 预加载当天到店名单
    from app.services import customer_service, visit_service
    visits = visit_service.list_visits(anchor_iso, space_id=space_id if space_id else None)
    def _nick(v):
        c = customer_service.get_customer(v.customer_id) if v.customer_id else None
        return c.nickname if c else ""
    visit_names = [n for v in visits if (n := _nick(v))]
    visit_context = "、".join(visit_names) if visit_names else "暂无到店人员"

    if not api_key:
        return {"reply": "未配置 AI API Key，请在「小程序模型配置」中设置", "action": "error"}

    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=model_config.temperature,
        max_tokens=model_config.max_tokens,
    ).bind_tools(ACTIVITY_CHAT_TOOLS)

    # 基础提示词从配置读取，动态数据在代码中追加
    system_text = render_prompt(prompt_config.system_prompt, {"date": anchor_iso})
    system_text += "\n\n" + date_context_block(anchor)
    system_text += (
        f"\n\n当天活动数据（{anchor_iso}）：\n{activity_context}\n"
        f"\n当天到店名单（{anchor_iso}）：{visit_context}\n"
        f"添加参与者时只能从上面的到店名单里选人。如果用户名字不在到店名单里，不能添加。\n"
        f"\n以上数据仅限 {anchor_iso}。如果用户提到其他日期，必须调用 query_activities 查询该日期的数据，不要用上面的数据回答其他日期的问题。\n"
        f"注意：老师和参与者是两个不同的角色。「老师」是活动的授课/主持老师，「参与者」是参加活动的客户。添加参与者时只能添加到参与者列表，不能把老师当作参与者。用户说的名字如果在老师列表里出现但不在参与者列表里，说明这个人是老师而不是参与者。"
    )

    messages = [SystemMessage(content=system_text)]
    for item in (history or [])[-10:]:
        role = item.get("role", "user")
        content = item.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=message))

    try:
        response = await asyncio.to_thread(llm.invoke, messages)
    except Exception as e:
        return {"reply": f"AI 调用失败：{str(e)[:100]}", "action": "error"}

    print(f"[activity_chat] LLM 响应: tool_calls={response.tool_calls}, content={response.content[:200] if response.content else 'None'}")

    # 执行工具调用（多轮）
    # 注意：不能在一次成功后提前 return——同一批里可能还有其它工具调用
    # （如「加个颂钵下午2点，再把觉醒改到3点」），提前返回会把后续指令丢掉。
    # 防重复用签名去重实现：同名+同参数的写操作在整个请求内只执行一次。
    WRITE_TOOLS = {"create_activity", "update_activity", "remove_activity", "add_participant", "set_teacher"}
    executed_writes = set()
    tool_call_log = []
    for _round in range(5):
        if not response.tool_calls:
            break
        for tc in response.tool_calls:
            tool_fn = ACTIVITY_CHAT_TOOL_MAP.get(tc["name"])
            if tool_fn:
                sig = tc["name"] + "|" + json.dumps(tc["args"], sort_keys=True, ensure_ascii=False)
                if tc["name"] in WRITE_TOOLS and sig in executed_writes:
                    result = json.dumps({"ok": True, "action": "duplicate_skipped"}, ensure_ascii=False)
                    print(f"[activity_chat] 跳过重复写操作: {sig}")
                else:
                    if tc["name"] in WRITE_TOOLS:
                        executed_writes.add(sig)
                    try:
                        result = await asyncio.to_thread(tool_fn.invoke, tc["args"])
                    except Exception as e:
                        result = json.dumps({"ok": False, "error": str(e)[:100]}, ensure_ascii=False)
                print(f"[activity_chat] 工具调用: {tc['name']}({tc['args']}) => {str(result)[:200]}")
                tool_call_log.append({"name": tc["name"], "args": tc["args"], "result": str(result)[:500]})
                messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))
            else:
                print(f"[activity_chat] 未知工具: {tc['name']}")
        try:
            response = await asyncio.to_thread(llm.invoke, messages)
        except Exception as e:
            return {"reply": f"AI 调用失败：{str(e)[:100]}", "action": "error"}
        print(f"[activity_chat] 第{_round+1}轮 LLM 响应: tool_calls={response.tool_calls}, content={response.content[:200] if response.content else 'None'}")

    # 生成回复
    if response.content and response.content.strip():
        reply = response.content.strip()
    elif tool_call_log:
        reply = _build_reply_from_tools(tool_call_log)
    else:
        reply = "没太听懂，能再说一遍吗？"

    return {"reply": reply, "action": "done"}


def _build_reply_from_tools(tool_call_log: list) -> str:
    """根据工具调用结果直接生成回复"""
    for tc in tool_call_log:
        try:
            result = json.loads(tc["result"])
        except (json.JSONDecodeError, TypeError):
            continue

        if result.get("ok"):
            action = result.get("action", "")
            if action == "create":
                return f"{result.get('type', '活动')}「{result.get('name', '')}」已创建。"
            if action == "query":
                return result.get("text", "查询完成。")
            if action == "update":
                return f"已修改「{result.get('name', '')}」的{result.get('field', '')}。"
            if action == "remove":
                return f"已删除{result.get('type', '活动')}「{result.get('name', '')}」。"
            if action == "add_participant":
                return f"已将{result.get('name', '')}添加到「{result.get('activity', '')}」。"
            if action == "already_in":
                return f"{result.get('name', '')}已经在「{result.get('activity', '')}」的参与者名单里了。"
            if action == "set_teacher":
                return f"「{result.get('activity', '')}」的老师已设为{result.get('name', '')}。"
        else:
            reason = result.get("reason", "")
            name = result.get("name", "")
            if reason == "not_found":
                suggestions = result.get("suggestions", [])
                if suggestions:
                    return f"找不到「{name}」，你是不是想说：{'、'.join(suggestions)}？"
                actual = result.get("actual_on_date", [])
                if actual:
                    return f"找不到「{name}」，当天的活动有：{'、'.join(actual)}"
                return f"找不到「{name}」，当天没有活动安排。"
            if reason == "activity_not_found":
                actual = result.get("actual_on_date", [])
                if actual:
                    return f"找不到活动「{name}」，当天的活动有：{'、'.join(actual)}"
                return f"找不到活动「{name}」，当天没有活动安排。"
            if reason == "ambiguous":
                candidates = result.get("candidates", [])
                return f"找到了多个匹配「{name}」的活动：{'、'.join(candidates)}，你要操作哪一个？"
            if reason == "teacher_not_found":
                suggestions = result.get("suggestions", [])
                if suggestions:
                    return f"找不到老师「{name}」，你是不是想说：{'、'.join(suggestions)}？"
                return f"找不到老师「{name}」，确认一下名字？"
            if reason == "owner_not_found":
                suggestions = result.get("suggestions", [])
                if suggestions:
                    return f"找不到案主「{name}」，你是不是想说：{'、'.join(suggestions)}？"
                return f"找不到案主「{name}」，确认一下名字？"
            if reason == "customer_not_found":
                suggestions = result.get("suggestions", [])
                if suggestions:
                    return f"找不到「{name}」，你是不是想说：{'、'.join(suggestions)}？"
                return f"找不到「{name}」，确认一下名字？"
            if reason == "not_in_visit_list":
                available = result.get("available", [])
                if available:
                    return f"「{name}」不在今天的到店名单里。今天到店的人有：{'、'.join(available)}"
                return f"「{name}」不在今天的到店名单里，今天还没有配置到店人员。"
            if reason == "invalid_type":
                return f"不支持的活动类型：{result.get('type', '')}。"
            if reason == "missing_start_time":
                return f"创建「{result.get('name', '')}」需要开始时间，几点开始？"
            if reason == "missing_teacher":
                return f"创建「{result.get('name', '')}」需要指定老师，哪位老师带？"
            if reason == "missing_owner":
                return f"「{result.get('type', '')}」需要案主，案主是谁？"
            if reason == "missing_course_type":
                return f"「{result.get('name', '')}」属于{result.get('type', '')}的哪种具体类型？"
            if reason == "invalid_date":
                return f"没听懂这个日期「{result.get('value', '')}」，换个说法试试？比如「明天」「周五」或「7月20号」。"
            if reason == "invalid_time":
                return f"没听懂这个时间「{result.get('value', '')}」，换个说法试试？比如「下午3点」或「15:00」。"

    return "操作完成。"
