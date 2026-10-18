"""成交课程只读课表元数据，不改变参与名单、扣卡和课时。"""

from datetime import date

from fastapi import HTTPException


def fill_course_organizations(items: list[dict]) -> None:
    """仅补充当前返回页的课程所属，旧订单无需改写；组织口径与粗门扣卡一致。"""
    for item in items:
        item["deal_course_organization_name"] = ""
    linked = [item for item in items if item.get("deal_course_key")]
    if not linked:
        return
    from app.services import (
        class_record_service,
        course_service,
        course_type_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
        organization_service,
    )

    getters = {
        "class_record": class_record_service.get_record,
        "group_case": group_case_session_service.get_session,
        "emotional_release": emotional_release_session_service.get_session,
        "energy_knot": energy_knot_session_service.get_session,
        "internal_course": internal_course_session_service.get_session,
    }
    organizations = organization_service.list_organizations()
    organization_names = {org.id: org.name for org in organizations}
    courses = course_service.list_courses()
    course_orgs = {course.id: course.organization_id for course in courses if course.organization_id in organization_names}
    name_orgs = {course.name: course.organization_id for course in courses if course.name and course.organization_id in organization_names}
    type_orgs = {row["name"]: row["organization_id"] for row in course_type_service.list_course_types()
                 if row.get("name") and row.get("organization_id") in organization_names}
    teacher_orgs: dict[str, set[str]] = {}
    for org in organizations:
        for teacher_id in org.member_ids:
            teacher_orgs.setdefault(teacher_id, set()).add(org.id)
    resolved = {}
    for item in linked:
        key = item["deal_course_key"]
        if key not in resolved:
            source, _, record_id = key.partition(":")
            record = getters[source](record_id) if source in getters and record_id else None
            org_ids: set[str] = set()
            if record and source == "class_record":
                org_id = (course_orgs.get(getattr(record, "course_id", ""))
                          or name_orgs.get(getattr(record, "course_name", ""))
                          or type_orgs.get(getattr(record, "course_type", "")))
                if org_id:
                    org_ids.add(org_id)
            if record and not org_ids:
                teacher_ids = set(getattr(record, "teacher_ids", []) or [])
                if getattr(record, "achiever_id", ""):
                    teacher_ids.add(record.achiever_id)
                for teacher_id in teacher_ids:
                    org_ids.update(teacher_orgs.get(teacher_id, set()))
            resolved[key] = "、".join(organization_names[org_id] for org_id in sorted(org_ids))
        item["deal_course_organization_name"] = resolved[key]


def course_options(day: str, request=None) -> list[dict]:
    from app.api.class_records import read_day_courses

    try:
        date.fromisoformat(day)
    except (ValueError, TypeError):
        raise HTTPException(400, "请选择正确的成交日期") from None
    data, _ = read_day_courses(day, request=request, include_note_counts=False)
    sources = (("class_records", "class_record", "沙龙活动"),
               ("gcs_sessions", "group_case", "觉醒游戏"),
               ("ers_sessions", "emotional_release", "情绪释放"),
               ("eks_sessions", "energy_knot", "能量结"),
               ("ics_sessions", "internal_course", "沙龙技能学习"))
    options = []
    for field, source, fallback in sources:
        for row in data.get(field, []):
            name = row.get("activity_name") or row.get("course_name") or row.get("name") or fallback
            label = " · ".join(str(value) for value in (row.get("start_time"), name, row.get("space_name"), row.get("room_name")) if value)
            options.append({"key": f"{source}:{row['id']}", "name": label, "date": day})
    return sorted(options, key=lambda item: (item["name"], item["key"]))


def normalize_course(data, existing=None, request=None) -> None:
    """只校验本次修改的关联；旧订单不带关联默认仍与课程无关。"""
    incoming = data if isinstance(data, dict) else data.model_dump()
    current = (existing if isinstance(existing, dict) else existing.model_dump()
               if hasattr(existing, "model_dump") else vars(existing) if existing else {})
    if existing and not any(field in incoming for field in ("deal_course_key", "deal_course_name", "deal_date")):
        return
    key = incoming.get("deal_course_key", current.get("deal_course_key", ""))
    if not isinstance(key, str):
        raise HTTPException(400, "请选择有效的成交课程")
    key = key.strip()
    name = ""
    if key:
        day = incoming.get("deal_date", current.get("deal_date", current.get("deduction_date", "")))
        option = next((item for item in course_options(day, request) if item["key"] == key), None)
        if not option:
            raise HTTPException(400, "成交课程不属于所选成交日期，请重新选择或选择与课程无关")
        name = option["name"]
    for field, value in (("deal_course_key", key), ("deal_course_name", name)):
        if isinstance(data, dict):
            data[field] = value
        else:
            setattr(data, field, value)
    if request is not None and hasattr(request, "state") and (key or current.get("deal_course_key")):
        context = getattr(request.state, "operation_log_context", None) or {}
        context["after_data"] = {**current, **incoming, "deal_course_key": key, "deal_course_name": name}
        request.state.operation_log_context = context
