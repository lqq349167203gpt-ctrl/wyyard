import json
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.utils.pagination import paginate
from app.services import class_record_service

router = APIRouter(prefix="/api/class-records", tags=["class-records"])


@router.get("")
def list_records(date: Optional[str] = None, page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100)):
    items = class_record_service.list_records(date)
    if page is not None:
        return paginate(items, page, page_size or 10)
    return items


@router.get("/unified")
def list_unified(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    type: str | None = Query(None),
    name: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    space_id: str | None = Query(None),
):
    from app.services import (
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    )

    items = []
    # Class records
    for r in class_record_service.list_records(None, start_date, end_date):
        items.append({"type": "class", "data": r.model_dump(mode="json") if hasattr(r, "model_dump") else r, "date": r.get("date", "") if isinstance(r, dict) else getattr(r, "date", "")})

    # Group case sessions
    for s in group_case_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "gcs", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # Emotional release sessions
    for s in emotional_release_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "ers", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # Energy knot sessions
    for s in energy_knot_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "eks", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # Internal course sessions
    for s in internal_course_session_service.list_sessions(None, start_date, end_date):
        items.append({"type": "ics", "data": s.model_dump(mode="json") if hasattr(s, "model_dump") else s, "date": s.get("date", "") if isinstance(s, dict) else getattr(s, "date", "")})

    # Apply filters
    if type:
        items = [i for i in items if i["type"] == type]

    if name:
        name_lower = name.lower()
        filtered = []
        for i in items:
            title = ""
            if i["type"] == "class":
                title = i["data"].get("course_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "course_name", "")
            elif i["type"] == "gcs":
                owner = i["data"].get("owner_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "owner_name", "")
                title = f"觉醒游戏【{owner or '未分配'}】"
            elif i["type"] == "ers":
                owner = i["data"].get("owner_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "owner_name", "")
                title = f"情绪释放【{owner or '未分配'}】"
            elif i["type"] == "eks":
                owner = i["data"].get("owner_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "owner_name", "")
                desc = i["data"].get("description", "") if isinstance(i["data"], dict) else getattr(i["data"], "description", "")
                names = []
                try:
                    parsed = json.loads(desc) if desc else []
                    if isinstance(parsed, list):
                        names = [d.get("name", "") for d in parsed if d.get("name")]
                except Exception:
                    pass
                title = f"能量结【{'丨'.join(names)}】" if names else f"能量结【{owner or '未分配'}】"
            elif i["type"] == "ics":
                title = i["data"].get("course_name", "") if isinstance(i["data"], dict) else getattr(i["data"], "course_name", "")
            if name_lower in title.lower():
                filtered.append(i)
        items = filtered

    if start_date:
        items = [i for i in items if i["date"] >= start_date]
    if end_date:
        items = [i for i in items if i["date"] <= end_date]
    if space_id:
        items = [i for i in items if (i["data"].get("space_id", "") if isinstance(i["data"], dict) else getattr(i["data"], "space_id", "")) == space_id]

    # Sort by date desc, then start_time desc
    def sort_key(item):
        d = item["date"]
        st = item["data"].get("start_time", "") if isinstance(item["data"], dict) else getattr(item["data"], "start_time", "")
        return (d, st or "")
    items.sort(key=sort_key, reverse=True)

    return paginate(items, page, page_size)


@router.post("")
def create_record(data: dict):
    from app.models.class_record import ClassRecordCreate
    try:
        record = ClassRecordCreate(**data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return class_record_service.create_record(record)


@router.patch("/{record_id}")
def update_record(record_id: str, data: dict):
    record = class_record_service.update_record(record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


class ParticipantUpdate(BaseModel):
    participant_ids: List[str]


@router.patch("/{record_id}/participants")
def update_participants(record_id: str, data: ParticipantUpdate):
    record, warnings = class_record_service.update_participants(record_id, data.participant_ids)
    if not record:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")
    result = record.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.patch("/{record_id}/groups")
def update_groups(record_id: str, data: dict):
    groups = data.get("groups", [])
    record, warnings = class_record_service.update_groups(record_id, groups)
    if not record:
        if warnings:
            raise HTTPException(status_code=422, detail="; ".join(warnings))
        raise HTTPException(status_code=404, detail="记录不存在")
    result = record.model_dump(mode="json")
    result["warnings"] = warnings
    return result


@router.delete("/{record_id}")
def delete_record(record_id: str):
    if not class_record_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"message": "删除成功"}


@router.get("/calendar-counts")
def calendar_counts():
    """返回各日期的活动场数统计 {date: count}，只计数不序列化"""
    from app.services import (
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    )
    from collections import defaultdict
    counts: dict[str, int] = defaultdict(int)

    for r in class_record_service.list_records():
        if r.date:
            counts[r.date] += 1
    for s in group_case_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1
    for s in emotional_release_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1
    for s in energy_knot_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1
    for s in internal_course_session_service.list_sessions():
        if s.date:
            counts[s.date] += 1

    return dict(counts)


@router.get("/dashboard")
def dashboard(date: str = Query(...)):
    """单次请求返回当天全部数据，替代 8 个独立 API 调用"""
    from app.services import (
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
        visit_service,
        daily_grouping_service,
    )
    from datetime import datetime, timedelta

    # 计算日期范围（21 天窗口，与前端一致）
    d = datetime.strptime(date, "%Y-%m-%d")
    start_date = (d - timedelta(days=7)).strftime("%Y-%m-%d")
    end_date = (d + timedelta(days=13)).strftime("%Y-%m-%d")

    # 日历计数：所有日期（不等同于 calendar-counts 端点，不做权限过滤）
    from collections import defaultdict
    cal_counts: dict[str, int] = defaultdict(int)
    for r in class_record_service.list_records():
        if r.date: cal_counts[r.date] += 1
    for s in group_case_session_service.list_sessions():
        if s.date: cal_counts[s.date] += 1
    for s in emotional_release_session_service.list_sessions():
        if s.date: cal_counts[s.date] += 1
    for s in energy_knot_session_service.list_sessions():
        if s.date: cal_counts[s.date] += 1
    for s in internal_course_session_service.list_sessions():
        if s.date: cal_counts[s.date] += 1

    return {
        "class_records": class_record_service.list_records(date),
        "gcs_sessions": group_case_session_service.list_sessions(date),
        "ers_sessions": emotional_release_session_service.list_sessions(date),
        "eks_sessions": energy_knot_session_service.list_sessions(date),
        "ics_sessions": internal_course_session_service.list_sessions(date),
        "visits": visit_service.list_visits(date),
        "visit_counts": visit_service.get_date_counts(start_date=start_date, end_date=end_date),
        "calendar_counts": dict(cal_counts),
        "groupings": daily_grouping_service.get_grouping(date) or {"date": date, "groups": []},
    }


@router.get("/search-customers")
def search_customers(q: str = ""):
    return class_record_service.search_customers(q)
