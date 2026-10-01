"""固定治理清单：分页兼容、权限、按日读取和短期分析复用。"""

import asyncio
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.api import (
    communication_records,
    customers,
    daily_report,
    followup_records,
    offline_course_records,
    payment_exports,
)
from app.models.communication_record import CommunicationRecord
from app.models.offline_course_record import OfflineCourseRecord
from app.models.principal import PrincipalQuery
from app.services import principal_query_cache as cache
from app.services import storage
from app.services.payment_sources import PAYMENT_TYPES


def request(user_id="a"):
    return NS(state=NS(user_id=user_id, user_owner="老师甲", user_name="account", user_role="测试角色"))


def model(**fields):
    return NS(**fields, model_dump=lambda **_: dict(fields))


def test_communication_filters_before_paging_and_keeps_creator_choices(monkeypatch):
    api = communication_records
    people = [NS(id="a", nickname="昵称甲", name="姓名甲", member_type="次卡"), NS(id="b", nickname="昵称乙", name="姓名乙", member_type="体验会员")]
    records = [CommunicationRecord(id=str(i), customer_id="a", customer_nickname="昵称甲", content="记录", creator="老师甲", created_at=datetime.now(timezone.utc)) for i in range(13)]
    records += [records[0].model_copy(update={"id": "other", "customer_id": "b", "customer_nickname": "昵称乙", "creator": "老师乙"}), records[0].model_copy(update={"id": "hidden", "customer_id": "secret", "creator": "不可见"})]
    monkeypatch.setattr(api.communication_record_service, "list_records", lambda: records)
    monkeypatch.setattr(api.customer_service, "list_customers", lambda: people)
    monkeypatch.setattr(api.customer_access_service, "filter_customers", lambda *_: people)
    monkeypatch.setattr(api.customer_access_service, "can_view_detail_tab", lambda *_: True)
    monkeypatch.setattr(api.communication_record_service, "can_manage_record", lambda *_: False)
    result = api.list_communication_records(request(), None, 2, 10, "姓名甲", "次卡", "老师甲")
    assert result["total"] == 13 and len(result["items"]) == 3
    assert result["creators"] == ["老师乙", "老师甲"]
    assert all(not row["can_edit"] for row in result["items"])
    legacy = api.list_communication_records(request(), None, None, 10, "", "", "")
    assert isinstance(legacy, list) and len(legacy) == 14


def test_followup_pagination_preserves_scope_and_legacy_shape(monkeypatch):
    api = followup_records
    monkeypatch.setattr(api.customer_service, "list_customers", lambda: [])
    monkeypatch.setattr(api.customer_access_service, "visible_customer_ids", lambda *_: {"a"})
    monkeypatch.setattr(api.customer_access_service, "can_view_detail_tab", lambda *_: True)
    monkeypatch.setattr(api.activity_followup_service, "list_followups", lambda *_: [model(id=str(i), customer_id="a") for i in range(12)] + [model(id="hidden", customer_id="b")])
    result = api.list_followup_records(request(), None, 2, 10)
    assert result["total"] == 12 and len(result["items"]) == 2
    assert set(api.list_followup_records(request(), None, None, 10)) == {"items", "total"}
    with pytest.raises(HTTPException) as error:
        api.list_followup_records(request(), "b", 1, 10)
    assert error.value.status_code == 403


def test_offline_filters_participant_type_and_teacher_before_paging(monkeypatch):
    rows = [OfflineCourseRecord(id=str(i), participant_ids=["a"], course_type="类型甲", teacher="老师甲", created_at=datetime.now(timezone.utc)) for i in range(12)]
    rows += [rows[0].model_copy(update={"id": "other", "course_type": "类型乙"})]
    calls = []
    monkeypatch.setattr(offline_course_records.offline_course_record_service, "list_records", lambda customer_id=None: calls.append(customer_id) or rows)
    result = offline_course_records.list_offline_course_records("a", 2, 10, "类型甲", "老师甲")
    assert result["total"] == 12 and len(result["items"]) == 2
    assert offline_course_records.list_offline_course_records("a", None, 10, "", "") is rows
    assert calls[-1] == "a"


def test_all_payment_types_are_not_truncated_and_only_page_calculates_remaining(monkeypatch):
    from app.services import payment_sources

    api = payment_exports
    rows = [model(id=f"{i:03}", customer_id="a", nickname="昵称甲", deal_date="2026-09-01", created_at="", closer_name="老师甲") for i in range(123)]
    rows += [model(id="hidden", customer_id="b", nickname="昵称甲", deal_date="2026-09-30")]
    monkeypatch.setattr(api.customer_access_service, "require_transaction_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(api.customer_access_service, "visible_customer_ids", lambda *_: {"a"})
    monkeypatch.setattr(api.customer_service, "list_all_customers", lambda: [])
    monkeypatch.setattr(api.payment_export_service, "PROJECT_SOURCES", [("membership_card", "会员卡", lambda: rows)])
    calculated = []
    monkeypatch.setattr(payment_sources, "fill_effective_remaining", lambda item, kind: calculated.append(item["id"]))
    result = api.list_payment_records(request(), 13, 10, "昵称甲", "老师甲")
    assert result["total"] == 123 and result["total_pages"] == 13
    assert len(result["items"]) == len(calculated) == 3
    assert all(row["record"]["customer_id"] == "a" for row in result["items"])


def test_daily_core_uses_existing_protected_reads(monkeypatch):
    async def visits(**kwargs):
        assert kwargs["date"] == "2026-09-01" and kwargs["page"] is None
        return [{"id": "v"}]

    async def directory(_request):
        return [{"id": "a", "nickname": "昵称甲"}]

    monkeypatch.setattr(daily_report.visits, "list_visits", visits)
    monkeypatch.setattr(daily_report.customers, "list_customers_light", directory)
    monkeypatch.setattr(daily_report.class_records, "read_day_courses", lambda **_: ({
        "class_records": [], "gcs_sessions": [], "ers_sessions": [], "eks_sessions": [], "ics_sessions": [],
    }, {"a"}))
    monkeypatch.setattr(daily_report.member_identity_service, "list_identities", lambda: [])
    result = asyncio.run(daily_report.read_report(request(), date(2026, 9, 1)))
    assert result["visits"] == [{"id": "v"}]
    assert result["customers"] == [{"id": "a", "nickname": "昵称甲"}]


def test_daily_finance_preserves_relevant_history_and_excludes_other_customers(monkeypatch):
    from app.services import customer_service, visit_service

    monkeypatch.setattr(daily_report.customer_access_service, "require_transaction_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(daily_report.customer_access_service, "visible_customer_ids", lambda *_: {"a", "b", "c"})
    monkeypatch.setattr(customer_service, "list_customers", lambda: [])
    monkeypatch.setattr(visit_service, "list_visits", lambda _: [NS(customer_id="a")])
    monkeypatch.setattr(daily_report.class_record_service, "list_records", lambda _: [])
    for module in [daily_report.group_case_sessions, daily_report.emotional_release_sessions, daily_report.energy_knot_sessions]:
        monkeypatch.setattr(module, "list_sessions", lambda **_: [])
    payments = [model(id="history", customer_id="a", deal_date="2025-01-01"), model(id="today", customer_id="b", deal_date="2026-09-01"), model(id="unrelated", customer_id="c", deal_date="2025-01-01"), model(id="hidden", customer_id="d", deal_date="2026-09-01")]
    monkeypatch.setattr(daily_report, "list_payment_records", lambda kind: payments if kind == PAYMENT_TYPES[0] else [])
    monkeypatch.setattr(daily_report.project_deduction_service, "list_deductions", lambda **_: [model(id="old-deduction", customer_id="a", deduction_date="2025-01-01")])
    result = daily_report.read_finance_sources(request(), date(2026, 9, 1))
    assert [r["id"] for r in result["sources"][PAYMENT_TYPES[0]]] == ["history", "today"]
    assert result["deductions"][0]["id"] == "old-deduction"


@pytest.fixture
def analysis_cache(monkeypatch):
    cache._entries.clear()
    version, permissions, calls = [0], [{"scope": "own"}], []
    monkeypatch.setattr(cache, "data_revision", lambda: version[0])
    monkeypatch.setattr(cache.position_edit_permission_service, "get_permissions", lambda _: permissions[0])

    def analyze(req, query, export=False):
        calls.append((req.state.user_id, export))
        return {"items": [{"id": str(i)} for i in range(23)], "total": 23, "summary": {"count": 23}}

    monkeypatch.setattr(cache.principal_service, "analyze", analyze)
    yield version, permissions, calls
    cache._entries.clear()


def test_analysis_pages_reuse_result_without_mutating_cached_data(analysis_cache):
    _, _, calls = analysis_cache
    first = cache.query_result(request(), PrincipalQuery(page_size=10))
    first["items"][0]["id"] = "altered"
    first["summary"]["count"] = 0
    second = cache.query_result(request(), PrincipalQuery(page=2, page_size=10))
    assert second["items"][0]["id"] == "10" and second["summary"]["count"] == 23
    assert calls == [("a", True)]
    assert cache.query_result(request(), PrincipalQuery(page_size=10))["items"][0]["id"] == "0"
    assert cache.query_result(request(), PrincipalQuery(page=9, page_size=10))["page"] == 3


def test_analysis_cache_isolates_accounts_permissions_and_writes(analysis_cache):
    version, permissions, calls = analysis_cache
    query = PrincipalQuery()
    cache.query_result(request(), query)
    cache.query_result(request("b"), query)
    permissions[0] = {"scope": "all"}
    cache.query_result(request(), query)
    version[0] += 1
    cache.query_result(request(), query)
    assert len(calls) == 4


def test_analysis_failure_is_not_cached_and_mobile_has_its_own_cache_key(analysis_cache, monkeypatch):
    _, _, calls = analysis_cache
    original = cache.principal_service.analyze
    monkeypatch.setattr(cache.principal_service, "analyze", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("读取失败")))
    with pytest.raises(RuntimeError):
        cache.query_result(request(), PrincipalQuery())
    monkeypatch.setattr(cache.principal_service, "analyze", original)
    cache.query_result(request(), PrincipalQuery())
    first = cache.query_result(request(), PrincipalQuery(mobile_group="courses", page_size=10))
    second = cache.query_result(request(), PrincipalQuery(mobile_group="courses", page=2, page_size=10))
    assert first["items"][0]["id"] == "0" and second["items"][0]["id"] == "10"
    assert calls == [("a", True), ("a", True)]


def test_analysis_expiry_and_writes_during_calculation_do_not_reuse_result(analysis_cache, monkeypatch):
    version, _, calls = analysis_cache
    monkeypatch.setattr(cache, "_TTL", 0)
    cache.query_result(request(), PrincipalQuery())
    cache.query_result(request(), PrincipalQuery())
    assert len(calls) == 2
    monkeypatch.setattr(cache, "_TTL", 15)
    cache._entries.clear()
    original = cache.principal_service.analyze

    def changed_during_read(*args, **kwargs):
        result = original(*args, **kwargs)
        version[0] += 1
        return result

    monkeypatch.setattr(cache.principal_service, "analyze", changed_during_read)
    cache.query_result(request(), PrincipalQuery())
    assert not cache._entries


def test_storage_revision_changes_only_after_business_commit(monkeypatch):
    before = storage.data_revision()
    storage._mark_committed(["operation_logs.json", "sessions.json", "usage_sessions.json"])
    assert storage.data_revision() == before
    storage._mark_committed(["customers.json"])
    assert storage.data_revision() == before + 1
    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def execute(self, *_):
            pass

    failing, rolled_back = [False], []

    def commit():
        if failing[0]:
            raise RuntimeError("提交失败")

    conn = NS(cursor=Cursor, commit=commit, rollback=lambda: rolled_back.append(True))
    monkeypatch.setattr(storage, "_get_conn", lambda: conn)
    monkeypatch.setattr(storage, "_put_conn", lambda _: None)
    monkeypatch.setattr(storage, "_ensure_table", lambda _: None)
    storage.commit_pending_writes([("item", "customers.json", "a", {})])
    assert storage.data_revision() == before + 2
    failing[0] = True
    with pytest.raises(RuntimeError):
        storage.commit_pending_writes([("item", "customers.json", "a", {})])
    assert rolled_back == [True]
    assert storage.data_revision() == before + 2


def test_customer_light_counts_unique_arrived_days_without_private_fields(client, created_customer, monkeypatch):
    cid = created_customer["id"]
    monkeypatch.setattr(customers.visit_service, "list_basic_visits", lambda _: [NS(customer_id=cid, visit_date="2026-09-01", arrived=True), NS(customer_id=cid, visit_date="2026-09-01", arrived=True), NS(customer_id=cid, visit_date="2026-09-02", arrived=False)])
    result = client.get("/api/customers/light")
    assert result.status_code == 200
    row = next(row for row in result.json() if row["id"] == cid)
    assert row["visit_count"] == 1
    assert not {"phone", "wechat", "trauma_history", "total_payment"}.intersection(row)


def test_daily_report_endpoints_serialize_and_validate_dates(client):
    core = client.get("/api/daily-report", params={"date": "2026-01-01"})
    assert core.status_code == 200
    assert set(core.json()) == {"date", "visits", "customers", "activities", "dashboard", "identities"}
    finance = client.get("/api/daily-report/finance-sources", params={"date": "2026-01-01"})
    assert finance.status_code == 200
    assert set(finance.json()["sources"]) == set(PAYMENT_TYPES)
    assert client.get("/api/daily-report", params={"date": "bad-date"}).status_code == 422


def test_daily_finance_denies_access_before_reading_sources(monkeypatch):
    def deny(*_, **__):
        raise HTTPException(403, "没有查看交易明细的权限")

    monkeypatch.setattr(daily_report.customer_access_service, "require_transaction_access", deny)
    monkeypatch.setattr(daily_report, "list_payment_records", lambda _: pytest.fail("无权限时不应读付费数据"))
    with pytest.raises(HTTPException) as error:
        daily_report.read_finance_sources(request(), date(2026, 9, 1))
    assert error.value.status_code == 403
