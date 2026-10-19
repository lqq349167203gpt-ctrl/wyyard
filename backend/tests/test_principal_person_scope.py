"""个人经营范围：客户归属一致，各指标使用各自的日期口径。"""

from datetime import date
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api import principal as api
from app.api import statistics
from app.models.principal import PrincipalQuery
from app.services import principal_service as service
from app.services.principal_mobile_service import compact_breakdown, overview_metrics
from app.services.principal_response_service import detail_page
from app.services.principal_service import collect_data as collect_course_data


def person(cid, name, referrer="", referral_date=""):
    return NS(id=cid, nickname=name, name="", referrer=referrer, referral_date=referral_date)


def test_referrer_options_have_historical_clients_and_respect_own_scope():
    orgs = [NS(member_ids=["a"], referrer_mode="member")]
    people = {c.id: c for c in [person("a", "甲"), person("b", "乙"), person("empty", "无引流"),
                               person("old", "历史客户", "甲", "2025-01-01"), person("new", "本期客户", "乙", "2026-01-01"),
                               person("future", "未来客户", "无引流", "9999-01-01")]}
    assert {c["id"] for c in service.referrer_options(orgs, people)} == {"a", "b"}
    assert service.referrer_options(orgs, people, own_scope=True) == [{"id": "a", "name": "甲", "count": 1}]
    people["duplicate"] = person("duplicate", "甲")
    assert service.referrer_options(orgs, people, own_scope=True) == []


@pytest.fixture
def personal_data(monkeypatch):
    people = {c.id: c for c in [person("a", "引流甲"), person("b", "引流乙"),
                               person("old", "历史客户", "引流甲", "2025-12-01"),
                               person("new", "本期客户", "引流甲", "2026-01-01"),
                               person("other", "其他客户", "引流乙", "2026-01-01")]}
    orgs = [NS(id="org", name="俱乐部", member_ids=["a"], referrer_mode="member")]
    permissions = {"principal_scope": "all", "customer_access": {"transaction_access": "detail"}}
    events = [{"id": f"order-{cid}", "date": "2026-01-15", "customer_id": cid, "customer": people[cid].nickname,
               "organization_id": "org", "organization": "俱乐部", "kind": "purchase", "product": "membership",
               "subtype": "398会员", "label": "会员卡", "closers": ""} for cid in people]
    monkeypatch.setattr(service, "collect_data", lambda *_a, **_k: (orgs, permissions, events, []))
    monkeypatch.setattr(service, "scope", lambda _: (orgs, people, permissions))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: list(people.values()))
    monkeypatch.setattr(service.customer_access_service, "require_transaction_access", lambda *_a, **_k: None)
    visits = [NS(id=f"visit-{cid}", customer_id=cid, visit_date="2026-01-15", created_at="2026-01-14",
                 cancelled=False, arrived=True, referrer_handler="邀约人") for cid in people]
    monkeypatch.setattr(service.visit_service, "list_basic_visits", lambda ids: [v for v in visits if v.customer_id in ids])
    monkeypatch.setattr(service.visit_service, "get_arrived_customer_ids_by_date", lambda: {"2026-01-15": set(people)})
    activity = NS(id="activity", date="2026-01-15", owner_id="old", participant_ids=["a", "new", "other"],
                  teacher_ids=[], withdrawn_participant_ids=[], is_deleted=False, description="", groups=[])
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (("gcs", "觉醒游戏", lambda: [activity]),))
    return NS(state=NS(user_id="test", user_role="超级管理员")), people, permissions


def query(**values):
    return PrincipalQuery(scope_type="person", referrer_id="a", date_from=date(2026, 1, 1), date_to=date(2026, 1, 31), **values)


def test_person_stats_include_old_clients_but_exclude_referrer_and_others(personal_data):
    request, _, _ = personal_data
    result = service.analyze(request, query())
    assert result["summary"]["引流人数"] == 1
    assert result["summary"]["交易笔数"] == result["summary"]["活动参与次数"] == 2
    assert result["summary"]["活动案主次数"] == result["summary"]["活动参与者次数"] == 1
    assert result["summary"]["课程数"] == 0 and result["items"] == []
    breakdown = result["breakdown"]
    metrics = overview_metrics(breakdown, [])
    assert metrics["traffic_count"] == metrics["traffic_deals"] == 1
    assert metrics["invite"]["arrive_count"] == {"times": 2, "people": 2}
    assert metrics["initiated_times"] == metrics["initiated_people"] == 2
    assert [c["id"] for c in breakdown["traffic"][0]["customers"]] == ["new"]
    assert breakdown["traffic"][0]["products"][0]["count"] == 1
    for kind in ("invite_arrivals", "participation"):
        assert {c["id"] for c in detail_page(breakdown, query(overview_detail=kind))["items"]} == {"old", "new"}
    assert {c["customer_id"] for c in service.analyze(request, query(tab="orders"))["items"]} == {"old", "new"}
    compact = compact_breakdown(breakdown)
    assert "customers" not in compact["invite_traffic"][0] and "members" not in compact["participation"]


def test_no_new_referrals_still_has_invites_activities_and_deals(personal_data):
    request, people, _ = personal_data
    people["new"].referral_date = "2025-12-02"
    result = service.analyze(request, query())
    assert result["summary"]["引流人数"] == 0
    assert result["summary"]["交易笔数"] == result["summary"]["活动参与次数"] == 2
    assert result["breakdown"]["traffic"] == []
    assert overview_metrics(result["breakdown"], ["traffic:引流甲"])["invite"]["arrive_count"] == {"times": 2, "people": 2}
    assert detail_page(result["breakdown"], query(overview_detail="invite_arrivals"))["total"] == 2


def test_missing_selection_is_empty_instead_of_all_clients(personal_data):
    request, _, _ = personal_data
    result = service.analyze(request, query().model_copy(update={"referrer_id": ""}))
    assert result["summary"]["引流人数"] == result["summary"]["交易笔数"] == result["summary"]["活动参与次数"] == 0


@pytest.mark.parametrize("referrer_id", ["missing", "new", "b"])
def test_unauthorized_referrer_cannot_be_requested_directly(personal_data, referrer_id):
    request, _, permissions = personal_data
    permissions["principal_scope"] = "own"
    with pytest.raises(HTTPException) as error:
        service.analyze(request, query().model_copy(update={"referrer_id": referrer_id}))
    assert error.value.status_code == 403


def test_both_metadata_modes_have_same_positive_referrers(personal_data):
    request, _, _ = personal_data
    assert api.metadata(request, lite=True)["referrers"] == api.metadata(request)["referrers"]
    assert {c["id"] for c in api.metadata(request, lite=True)["referrers"]} == {"a", "b"}


@pytest.mark.parametrize("values", [{"scope_type": "person", "organization_id": "org"},
                                    {"scope_type": "person", "tab": "conversion"}, {"referrer_id": "a"}])
def test_conflicting_scope_inputs_are_rejected(values):
    with pytest.raises(ValidationError):
        PrincipalQuery(**values)


def test_person_arrival_export_includes_historical_referrals_and_excludes_other_people(personal_data, monkeypatch):
    request, _, _ = personal_data
    monkeypatch.setattr(api, "audit", lambda *_a, **_k: None)
    monkeypatch.setattr(api, "_xlsx_response", lambda _sheet, headers, rows, _file, **_kwargs: {"headers": headers, "rows": rows})
    exported = api.export(query(export_view="invite_arrivals", export_columns=["name"]), request)
    assert exported["headers"] == ["昵称"]
    assert {row[0] for row in exported["rows"]} == {"历史客户", "本期客户"}


@pytest.fixture
def personal_courses(personal_data, monkeypatch):
    import json

    request, people, _ = personal_data
    # 使用真实课程汇总入口，核对多人同课、只有案主、未到场和不可见组织的边界。
    monkeypatch.setattr(service, "collect_data", collect_course_data)
    organizations, _, _ = service.scope(request)
    monkeypatch.setattr(service.organization_service, "list_organizations", lambda: organizations)
    monkeypatch.setattr(service.course_service, "list_courses", lambda: [NS(id="course", organization_id="org"), NS(id="hidden", organization_id="hidden")])
    monkeypatch.setattr(service.course_type_service, "list_course_types", lambda: [])
    monkeypatch.setattr(service.project_deduction_service, "list_deductions", lambda: [])
    monkeypatch.setattr(service.project_deduction_service, "coarse_customer_ids_by_activity", lambda: {("class", "shared"): {"new", "other"}})
    monkeypatch.setattr(service, "PRODUCTS", ())

    def activity(aid, **values):
        return NS(**{"id": aid, "date": "2026-01-15", "course_id": "course", "course_type": "读书交流",
                     "activity_name": "读书会", "name": "觉醒游戏", "teacher_ids": ["b"], "participant_ids": [],
                     "withdrawn_participant_ids": [], "groups": [], "owner_id": "", "description": "",
                     "is_deleted": False, "membership_deduction_count": 2, **values})

    classes = [activity("shared", participant_ids=["old", "new", "other", "a"]),
               activity("unrelated", participant_ids=["other", "a"]),
               activity("absent", participant_ids=["new"], date="2026-01-16"),
               activity("previous", participant_ids=["old"], date="2025-12-31"),
               activity("hidden", participant_ids=["old"], course_id="hidden"),
               activity("deleted", participant_ids=["new"], is_deleted=True)]
    games = [activity("owner", owner_id="old", participant_ids=["other", "a"])]
    energy = [activity("parts", owner_id="old", description=json.dumps([{"id": "old", "count": 2}, {"id": "other", "count": 4}]))]
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("class", "沙龙活动", lambda: classes), ("gcs", "觉醒游戏", lambda: games), ("eks", "能量结", lambda: energy),
    ))
    monkeypatch.setattr(service.visit_service, "get_arrived_customer_ids_by_date", lambda: {day: set(people) for day in ("2025-12-31", "2026-01-15")})
    return request


def test_person_courses_count_shared_session_once_and_scope_names_and_service_people(personal_courses):
    result = service.analyze(personal_courses, query())
    assert result["summary"]["课程数"] == 3
    assert result["summary"]["课时数"] == 4
    assert result["summary"]["到场人数"] == result["summary"]["到场人次"] == 2
    assert result["summary"]["服务案主人次"] == 2
    assert result["summary"]["服务参与人次"] == 2
    rows = {row["id"]: row for row in result["items"]}
    assert set(rows) == {"class:shared", "gcs:owner", "eks:parts"}
    salon = rows["class:shared"]
    assert salon["participants"] == 2
    assert {person["id"] for person in salon["new_people"] + salon["old_people"]} == {"old", "new"}
    assert salon["coarse_people"] == [{"id": "new", "name": "本期客户"}]
    assert rows["gcs:owner"]["owner"] == rows["eks:parts"]["owner"] == "历史客户"
    assert "部位数｜2 处" in "\n".join(rows["eks:parts"]["details"])
    assert all("其他客户" not in "\n".join(row["details"]) for row in rows.values())
    salon_stats = next(item for item in result["breakdown"]["courses"]["by_type"] if item["key"] == "沙龙活动")
    assert salon_stats["count"] == 1 and salon_stats["people"] == salon_stats["visits"] == 2
    # 活动名称是「读书会」，二级统计按沙龙类型「读书交流」。
    assert [(item["key"], item["label"], item["organization"]) for item in salon_stats["subtypes"]] == [
        ("读书交流｜俱乐部", "读书交流", "俱乐部"),
    ]
    assert "读书会" not in salon_stats["subtypes"][0]["label"]


def test_person_course_filters_participant_view_and_export_share_scope(personal_courses):
    result = service.analyze(personal_courses, query(breakdown=["type:沙龙活动"]))
    assert [row["id"] for row in result["items"]] == ["class:shared"]
    typed = service.analyze(personal_courses, query(breakdown=["type:沙龙活动", "course:读书交流｜俱乐部"]))
    assert [row["id"] for row in typed["items"]] == ["class:shared"]
    titled = service.analyze(personal_courses, query(breakdown=["type:沙龙活动", "course:读书会｜俱乐部"]))
    assert titled["items"] == []
    participants = service.analyze(personal_courses, query(course_view="participant", participant_scope="internal"))
    assert {row["customer_id"] for row in participants["items"]} == {"old", "new"}
    assert service.analyze(personal_courses, query(course_view="participant", participant_scope="external"))["items"] == []
    exported = service.analyze(personal_courses, query(breakdown=["type:沙龙活动"]), export=True)
    assert exported["items"] == result["items"]


def test_person_course_history_is_limited_to_referred_clients_and_visible_organizations(personal_courses):
    history = query(tab="courses", course_view="participant", customer_id="old", participant_history_organization_id="org")
    result = service.analyze(personal_courses, history)
    assert {row["course_id"] for row in result["items"]} == {"class:shared", "gcs:owner", "eks:parts"}
    assert {row["participant_role"] for row in result["items"]} == {"案主", "参与者"}
    for cid in ("other", "a"):
        hidden = service.analyze(personal_courses, history.model_copy(update={"customer_id": cid}))
        assert hidden["total"] == 0 and hidden["items"] == []
    with pytest.raises(HTTPException) as error:
        service.analyze(personal_courses, history.model_copy(update={"referrer_id": "unknown"}))
    assert error.value.status_code == 403
    with pytest.raises(HTTPException) as error:
        service.analyze(personal_courses, history.model_copy(update={"participant_history_organization_id": "hidden"}))
    assert error.value.status_code == 403
