"""小程序读取优化只验证本次契约，不写业务数据。"""

import asyncio
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.api import communication_records as communication
from app.api import daily_report
from app.models.communication_record import CommunicationRecord
from app.models.principal import PrincipalQuery
from app.services import principal_mobile_service as mobile
from app.services import principal_query_cache as cache


def request(user="a"):
    return NS(state=NS(user_id=user, user_owner="老师甲", user_name="甲账号", user_role="测试角色"))


def test_communication_multi_creators_case_insensitive_and_full_counts(monkeypatch):
    customer = NS(id="a", nickname="Alice", name="姓名甲", member_type="次卡")
    rows = [CommunicationRecord(id=str(i), customer_id="a", customer_nickname="Alice", content="记录",
                               creator="老师甲" if i < 21 else "老师乙", created_at=datetime.now(timezone.utc))
            for i in range(23)]
    monkeypatch.setattr(communication.communication_record_service, "list_records", lambda: rows)
    monkeypatch.setattr(communication.customer_service, "list_customers", lambda: [customer])
    monkeypatch.setattr(communication.customer_access_service, "filter_customers", lambda *_: [customer])
    monkeypatch.setattr(communication.customer_access_service, "can_view_detail_tab", lambda *_: True)
    monkeypatch.setattr(communication.communication_record_service, "can_manage_record", lambda *_: False)
    result = communication.list_communication_records(request(), None, 2, 20, "alice", "", "", ["老师甲", "老师乙"])
    assert result["total"] == 23 and len(result["items"]) == 3
    assert result["creator_counts"] == {"老师甲": 21, "老师乙": 2}
    selected = communication.list_communication_records(request(), None, 1, 20, "", "", "", ["老师乙"])
    assert selected["total"] == 2


def test_communication_single_detail_checks_scope_and_current_nickname(monkeypatch):
    row = CommunicationRecord(id="one", customer_id="a", customer_nickname="旧昵称", content="内容",
                              creator="老师甲", created_at=datetime.now(timezone.utc))
    customer = NS(id="a", nickname="新昵称", name="姓名甲", is_deleted=False)
    monkeypatch.setattr(communication.communication_record_service, "get_record", lambda _: row)
    monkeypatch.setattr(communication.customer_service, "get_customer", lambda _: customer)
    monkeypatch.setattr(communication.customer_access_service, "can_view_customer_for_request", lambda *_: True)
    monkeypatch.setattr(communication.customer_access_service, "can_view_detail_tab", lambda *_: True)
    monkeypatch.setattr(communication.communication_record_service, "can_manage_record", lambda *_: False)
    result = communication.get_communication_record("one", request())
    assert result["customer_nickname"] == "新昵称" and result["can_edit"] is False
    monkeypatch.setattr(communication.customer_access_service, "can_view_customer_for_request", lambda *_: False)
    with pytest.raises(HTTPException) as error:
        communication.get_communication_record("one", request())
    assert error.value.status_code == 403


def test_daily_mobile_keeps_space_dashboard_and_transaction_permission(monkeypatch):
    async def visits(**kwargs):
        assert kwargs["space_id"] == "space-a"
        return []

    async def people(_request):
        return [{"id": "a"}]

    monkeypatch.setattr(daily_report.visits, "list_visits", visits)
    monkeypatch.setattr(daily_report.customers, "list_customers_light", people)
    monkeypatch.setattr(daily_report.member_identity_service, "list_identities", lambda: [])
    dashboard = {"class_records": [], "gcs_sessions": [], "ers_sessions": [], "eks_sessions": [], "ics_sessions": []}
    monkeypatch.setattr(daily_report.class_records, "read_day_courses", lambda **kwargs: (dashboard, {"a"}) if kwargs["space_id"] == "space-a" else None)
    monkeypatch.setattr(daily_report.customer_access_service, "transaction_access", lambda *_: "none")
    result = asyncio.run(daily_report.read_report(request(), date(2026, 9, 1), True, "space-a"))
    assert result["dashboard"] == dashboard and result["transaction_access"] == "none"
    assert result["activities"] == [] and result["date"] == "2026-09-01"


@pytest.mark.parametrize("group", ["courses", "traffic", "invite_arrive", "invite_initiated"])
def test_mobile_pages_reuse_analysis_without_double_paging_or_total_loss(monkeypatch, group):
    cache._entries.clear()
    calls = []
    monkeypatch.setattr(cache, "data_revision", lambda: 1)
    monkeypatch.setattr(cache.position_edit_permission_service, "get_permissions", lambda _: {})
    people = [{"id": str(i), "arrive_count": 1, "name": str(i)} for i in range(43)]
    result = {"items": people, "total": 43, "breakdown": {
        "traffic": [{"label": "老师甲", "customers": people}],
        "invite_inviters": [{"key": str(i), "label": str(i), "records": []} for i in range(43)],
    }, "teacher_group_totals": [{"total": 43}]}

    def analyze(_request, query, export=False):
        calls.append(export)
        return result

    monkeypatch.setattr(cache.principal_service, "analyze", analyze)
    for page in [1, 2, 3]:
        query = PrincipalQuery(mobile_group=group, page=page, page_size=20)
        response = mobile.mobile_result(cache.query_result(request(), query), query)
        assert response["total"] == 43
        assert len(response["items"]) == (3 if page == 3 else 20)
        assert response["teacher_group_totals"][0]["total"] == 43
        if group != "invite_initiated":
            assert response["items"][0]["id"] == str((page - 1) * 20)
    assert calls == [True]
    cache.query_result(request("b"), PrincipalQuery(mobile_group=group))
    assert calls == [True, True]
    cache._entries.clear()
