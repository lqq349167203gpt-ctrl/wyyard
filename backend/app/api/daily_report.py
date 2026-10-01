"""按日读取报表来源，复用原列表的权限与字段处理，不另建统计口径。"""

from datetime import date

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from app.api import (
    class_records,
    customers,
    emotional_release_sessions,
    energy_knot_sessions,
    group_case_sessions,
    visits,
)
from app.middleware.jwt_auth import require_page_permission
from app.services import (
    class_record_service,
    customer_access_service,
    member_identity_service,
    project_deduction_service,
)
from app.services.payment_sources import PAYMENT_TYPES, fill_effective_remaining, list_payment_records
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/daily-report", tags=["daily-report"], dependencies=[Depends(require_page_permission("daily-report"))])


def report_activities(course_data):
    """五类课程统一成报表展示字段；来源保留，避免与销卡来源混用。"""
    types = (
        ("class_records", "class_record", "沙龙活动"),
        ("gcs_sessions", "group_case", "觉醒游戏"),
        ("ers_sessions", "emotional_release", "情绪释放"),
        ("eks_sessions", "energy_knot", "能量结"),
        ("ics_sessions", "internal_course", "内部课程"),
    )
    activities = []
    for key, source, label in types:
        for record in course_data[key]:
            activities.append({
                **record,
                "id": f"{source}_{record['id']}",
                "source": source,
                "course_name": record.get("activity_name") or record.get("course_name") or record.get("name") or label,
                "course_type": record.get("course_type") or label,
                "is_public_welfare": bool(record.get("is_public_welfare")),
                "participant_ids": [item["id"] for item in record.get("participants", []) if not item.get("withdrawn")],
                # participants 已包含组长、组员且应用客户范围，不重复展开原始 groups。
                "groups": [],
            })
    return sorted(activities, key=lambda item: item.get("start_time") or "")


@router.get("")
async def read_report(request: Request, date: date, mobile: bool = False, space_id: str = ""):
    day = date.isoformat()
    result = {
        "visits": await visits.list_visits(date=day, customer_id=None, space_id=space_id or None, page=None, page_size=None, request=request),
        "customers": await customers.list_customers_light(request),
        "identities": member_identity_service.list_identities(),
    }
    # 与课表共用课程读取，不额外读取课表的历史日历、邀约与分组。
    course_data, _ = await run_in_threadpool(
        class_records.read_day_courses, date=day, space_id=space_id, request=request, include_note_counts=False,
    )
    result["date"] = day
    result["activities"] = report_activities(course_data)
    # 原始课程只供现有销卡算法使用；展示使用统一的 activities。
    result["dashboard"] = course_data
    if mobile:
        result["transaction_access"] = customer_access_service.transaction_access(get_request_roles(request))
    return result


@router.get("/finance-sources")
def read_finance_sources(request: Request, date: date, mobile: bool = False):
    customer_access_service.require_transaction_access(request, detail=True)
    from app.services import customer_service, visit_service

    day = date.isoformat()
    visible_ids = customer_access_service.visible_customer_ids(request, customer_service.list_customers())
    sources = {
        key: [r.model_dump(mode="json") for r in list_payment_records(key) if r.customer_id in visible_ids]
        for key in PAYMENT_TYPES
    }
    session_sources = {
        "gcs": group_case_sessions.list_sessions(date=day, page=None, page_size=None, request=request),
        "ers": emotional_release_sessions.list_sessions(date=day, page=None, page_size=None, request=request),
        "eks": energy_knot_sessions.list_sessions(date=day, page=None, page_size=None, request=request),
    }
    deductions = [r.model_dump(mode="json") for r in project_deduction_service.list_deductions(include_cancelled=True) if r.customer_id in visible_ids]
    relevant_ids = {v.customer_id for v in visit_service.list_visits(day) if v.customer_id in visible_ids}
    for activity in class_record_service.list_records(day):
        relevant_ids.update(activity.participant_ids)
        for group in activity.groups:
            relevant_ids.update([group.leader_id, group.deputy_id, *group.member_ids])
    for items in session_sources.values():
        for item in items:
            relevant_ids.add(item.get("owner_id") or "")
            relevant_ids.update(item.get("participant_ids") or [])
    for items in sources.values():
        relevant_ids.update(i["customer_id"] for i in items if i.get("deal_date") == day)
    relevant_ids.update(i["customer_id"] for i in deductions if i.get("deduction_date") == day)
    # 历史只保留当日涉及人员的卡与项目；余量所需的历史流水不能按日期截断。
    sources = {key: [i for i in items if i["customer_id"] in relevant_ids] for key, items in sources.items()}
    if mobile:
        # 原手机端其他项目列表已包含派生余量，合并入口不能改变该字段含义。
        for item in sources["other-projects"]:
            fill_effective_remaining(item, "other")
    return {
        "sources": sources, "sessions": session_sources,
        "deductions": [i for i in deductions if i["customer_id"] in relevant_ids],
    }
