"""课程用户名单、当前页反馈和重复计算回归。"""

from copy import deepcopy
from datetime import date
from types import SimpleNamespace as NS

import pytest

from app.api import principal as api
from app.models.principal import PrincipalQuery
from app.services import principal_query_cache as cache
from app.services import principal_service as service


def person(cid, member_type="", referrer=""):
    return NS(id=cid, nickname=cid, name="", member_type=member_type, referrer=referrer)


def course(cid="course", org="org", day="2026-01-15"):
    return {"id": cid, "organization_id": org, "organization": org, "date": day,
            "name": "课程", "type": "觉醒游戏", "hours": 2, "teacher_ids": [], "teachers": "老师",
            "participant_ids": ["p"], "participant_names": [("p", "用户甲")], "participants": 1,
            "owner_ids": ["o", "absent"], "service_owner_ids": ["o"], "owner_count": 1}


def test_referrer_directory_is_resolved_once_per_organization(monkeypatch):
    orgs = [NS(id=key, referrer_mode="all") for key in ("org", "other")]
    people = {str(i): person(str(i)) for i in range(2000)} | {"p": person("p")}
    calls = []
    original = service.org_referrer_names

    def referrers(org, customers):
        calls.append(org.id)
        return original(org, customers)

    monkeypatch.setattr(service, "org_referrer_names", referrers)
    courses = [course(str(i), "org" if i % 2 else "other") for i in range(1000)]
    assert len(service.course_participant_rows(courses, orgs, customers=people)) == 2000
    assert calls == ["other", "org"]


def test_actual_owners_and_participants_have_membership_and_role_without_duplicates():
    orgs = [NS(id="org", referrer_mode="all")]
    people = {"p": person("p", "体验会员"), "o": person("o", "30次卡"), "absent": person("absent")}
    record = course()
    record["participant_ids"].append("o")
    rows = service.course_participant_rows([record], orgs, customers=people)
    assert {(row["customer_id"], row["member_type"], row["participant_role"]) for row in rows} == {
        ("o", "30次卡", "案主"), ("p", "体验会员", "参与者"),
    }
    cards = service.participant_course_cards(rows)
    assert cards[0]["count"] == 2
    assert cards[0]["participants"][0]["participant_role"] == "案主"


def test_feedback_batches_current_customer_days_and_keeps_legacy_and_shared_notes(monkeypatch):
    rows = [{"customer_id": "p", "date": "2026-01-15"}, {"customer_id": "o", "date": "2026-01-15"}]
    before = deepcopy(rows)
    visits = [NS(id="v1", customer_id="p", visit_date="2026-01-15", cancelled=False),
              NS(id="v2", customer_id="p", visit_date="2026-01-15", cancelled=False),
              NS(id="owner", customer_id="o", visit_date="2026-01-15", cancelled=False, needs="历史需求", feedback="历史深度需求", healing_notes="历史跟进", experience="历史反馈"),
              NS(id="old", customer_id="p", visit_date="2026-01-14", cancelled=False),
              NS(id="cancelled", customer_id="p", visit_date="2026-01-15", cancelled=True),
              NS(id="hidden", customer_id="hidden", visit_date="2026-01-15", cancelled=False)]
    loads = []
    monkeypatch.setattr(service.visit_service, "list_basic_visits", lambda ids: loads.append(ids) or visits)

    def notes(ids):
        assert ids == {"v1", "v2", "owner"}
        return {"v1": {field: [{"id": f"course-note|v1|{field}", "content": field, "author": "老师甲"}]
                       for field in service.PARTICIPANT_FEEDBACK_FIELDS},
                "v2": {"follow_up": [{"id": "course-note|v2|follow_up", "content": "follow_up", "author": "老师甲"}]}}

    monkeypatch.setattr(service.visit_note_service, "group_notes_by_visit", notes)
    result = service.participant_feedback(rows)
    assert loads == [{"p", "o"}]
    assert rows == before
    assert result[0]["follow_up"] == "follow_up"
    assert len(result[0]["follow_up_entries"]) == 1
    assert [result[1][field] for field in service.PARTICIPANT_FEEDBACK_FIELDS] == ["历史需求", "历史深度需求", "历史跟进", "历史反馈"]
    assert result[0]["customer_info_entries"][0]["author"] == "老师甲"


@pytest.fixture
def cached_users(monkeypatch):
    cache._entries.clear()
    calls = {"analysis": 0, "grouping": 0, "feedback": []}
    permissions = {"customer_access": {"detail_tabs": {"follow_up": True}}}
    monkeypatch.setattr(cache, "data_revision", lambda: 0)
    monkeypatch.setattr(cache.position_edit_permission_service, "get_permissions", lambda _: permissions)
    original = service.participant_course_cards
    rows = [{"id": f"{i}-p", "course_id": str(i), "date": "2026-01-15", "name": f"课程{i}",
             "customer_id": str(i), "customer": str(i), "participant_role": "参与者"} for i in range(3)]

    def analyze(*_args, **kwargs):
        assert kwargs["defer_participant_feedback"] is True
        calls["analysis"] += 1
        return {"items": rows, "total": 3, "summary": {}, "columns": [], "breakdown": {}}

    def grouping(rows):
        calls["grouping"] += 1
        return original(rows)

    def feedback(items, *, course_cards=False):
        people = [p for c in items for p in c["participants"]] if course_cards else items
        calls["feedback"].append([p["customer_id"] for p in people])
        for p in people:
            p["customer_info"] = "当前页反馈"
        return items

    monkeypatch.setattr(service, "analyze", analyze)
    monkeypatch.setattr(service, "participant_course_cards", grouping)
    monkeypatch.setattr(service, "participant_feedback", feedback)
    yield calls, permissions
    cache._entries.clear()


def test_page_only_feedback_and_grouping_reuse_across_layouts(cached_users):
    calls, _ = cached_users
    request = NS(state=NS(user_id="test", user_role="超级管理员", user_owner=""))
    raw = cache.query_result(request, PrincipalQuery(course_view="participant", page_size=1))
    cards = cache.query_result(request, PrincipalQuery(course_view="participant", participant_layout="courses", page=2, page_size=1))
    assert raw["items"][0]["customer_id"] == "0"
    assert cards["items"][0]["participants"][0]["customer_id"] == "1"
    assert calls == {"analysis": 1, "grouping": 1, "feedback": [["0"], ["1"]]}
    assert "_participant_cards" not in cards
    snapshot = next(iter(cache._entries.values()))[1]
    assert all("customer_info" not in p for c in snapshot["_participant_cards"] for p in c["participants"])
    assert all("customer_info" not in p for p in snapshot["items"])


def test_no_feedback_permission_does_not_load_notes(cached_users):
    calls, permissions = cached_users
    permissions["customer_access"]["detail_tabs"]["follow_up"] = False
    result = cache.query_result(NS(state=NS(user_id="test", user_role="普通角色", user_owner="")),
                                PrincipalQuery(course_view="participant", participant_layout="courses"))
    assert calls["feedback"] == []
    assert all("customer_info" not in p for c in result["items"] for p in c["participants"])


def test_analyze_and_export_include_scoped_user_fields_and_enforce_notes_permission(monkeypatch):
    people = {"p": person("p", "体验会员"), "o": person("o", "30次卡")}
    orgs = [NS(id="org", referrer_mode="all")]
    permissions = {"customer_access": {"transaction_access": "none", "detail_tabs": {"follow_up": True}}}
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], [course()]))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: list(people.values()))
    monkeypatch.setattr(service.upsell_config_service, "level_order", lambda: [])
    notes_calls = []

    def feedback(rows, **_kwargs):
        notes_calls.append(True)
        content = {"visit_need": "来访需求正文", "customer_info": "深度需求正文", "follow_up": "跟进正文", "customer_feedback": "反馈正文"}
        return [{**row, **content,
                 **{f"{category}_entries": [{"content": text, "author": "老师甲"}]
                    for category, text in content.items()}} for row in rows]

    monkeypatch.setattr(service, "participant_feedback", feedback)
    request = NS(state=NS(user_role="超级管理员"))
    query = PrincipalQuery(tab="courses", course_view="participant", date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
    result = service.analyze(request, query)
    assert {row["customer_id"] for row in result["items"]} == {"p", "o"}
    assert all(row["customer_info"] == "深度需求正文" for row in result["items"])
    assert next(row for row in result["items"] if row["customer_id"] == "o")["org_participation_count"] == 1
    monkeypatch.setattr(api, "audit", lambda *_a, **_k: None)
    monkeypatch.setattr(api, "_xlsx_response", lambda _sheet, headers, rows, _file: {"headers": headers, "rows": rows})
    exported = api.export(query, request)
    assert {"用户", "会员身份", "本场身份", "来访需求", "深度需求", "跟进点", "客户反馈"}.issubset(exported["headers"])
    assert "案主" in {row[exported["headers"].index("本场身份")] for row in exported["rows"]}
    notes_calls.clear()
    permissions["customer_access"]["detail_tabs"]["follow_up"] = False
    hidden = service.analyze(request, query)
    assert not notes_calls
    assert all("customer_info" not in row and "customer_info_entries" not in row for row in hidden["items"])


def test_history_drilldown_matches_cumulative_count_and_paginates_without_notes(monkeypatch):
    people = {cid: person(cid) for cid in ("p", "o", "absent")}
    orgs = [NS(id="org", referrer_mode="all"), NS(id="other", referrer_mode="all")]
    permissions = {"customer_access": {"transaction_access": "none", "detail_tabs": {"follow_up": True}}}
    records = [{**course(f"current-{i:02d}"), "activity_type": "gcs"} for i in range(25)]
    records += [{**course("earlier", day="2026-01-01"), "activity_type": "gcs"},
                {**course("salon", day="2026-01-10"), "activity_type": "class", "type": "沙龙活动", "course_subtype": "读书会", "service_owner_ids": []},
                {**course("before-2026", day="2025-12-31"), "activity_type": "gcs"},
                {**course("other-org", org="other"), "activity_type": "gcs"}]
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], deepcopy(records)))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: list(people.values()))
    monkeypatch.setattr(service.upsell_config_service, "level_order", lambda: [])
    monkeypatch.setattr(service, "participant_feedback", lambda rows: rows)
    request = NS(state=NS(user_role="超级管理员", user_id="history", user_owner=""))
    values = dict(tab="courses", course_view="participant", organization_id="org", activity_type="gcs",
                  date_from=date(2026, 1, 15), date_to=date(2026, 1, 31))
    original = service.analyze(request, PrincipalQuery(**values))
    cumulative = next(row for row in original["items"] if row["customer_id"] == "p")["org_participation_count"]
    assert cumulative == 25
    assert service.participant_course_cards(original["items"])[0]["organization_id"] == "org"

    def no_notes(*_a, **_kw):
        pytest.fail("课程历史不能读取需求或反馈")

    monkeypatch.setattr(service, "participant_feedback", no_notes)
    monkeypatch.setattr(cache, "data_revision", lambda: 1)
    monkeypatch.setattr(cache.position_edit_permission_service, "get_permissions", lambda _: permissions)
    cache._entries.clear()
    try:
        history = PrincipalQuery(**values, customer_id="p", participant_history_organization_id="org", page_size=10)
        pages = [cache.query_result(request, history.model_copy(update={"page": page})) for page in (1, 2, 3)]
        assert [len(page["items"]) for page in pages] == [10, 10, 5]
        assert pages[0]["total"] == cumulative
        items = [row for page in pages for row in page["items"]]
        assert len({row["course_id"] for row in items}) == 25
        assert [row["course_id"] for row in items] == sorted([f"current-{i:02d}" for i in range(25)], reverse=True)
        assert all(row["participant_role"] == "参与者" and row["teachers"] == "老师" for row in items)
        assert all("customer_info" not in row and "customer_info_entries" not in row for row in items)
        assert all("_participant_cards" not in value[1] for value in cache._entries.values())
        broader = service.analyze(request, history.model_copy(update={"date_from": date(2026, 1, 1), "date_to": None, "activity_type": ""}), export=True)
        assert broader["total"] == 27
        assert broader["items"][-1]["course_id"] == "earlier"
        assert all(row["organization_id"] == "org" and row["date"] >= "2026-01-01" for row in broader["items"])
        owner = service.analyze(request, history.model_copy(update={"customer_id": "o"}))
        assert owner["total"] == 25
        assert all(row["participant_role"] == "案主" for row in owner["items"])
        absent = service.analyze(request, history.model_copy(update={"customer_id": "absent"}))
        assert absent["total"] == 0 and absent["items"] == []
        for org in ("other", "hidden"):
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as error:
                service.analyze(request, history.model_copy(update={"participant_history_organization_id": org}))
            assert error.value.status_code == 403
    finally:
        cache._entries.clear()


@pytest.mark.parametrize("values", [{}, {"tab": "courses"}, {"tab": "courses", "course_view": "participant"},
                                    {"tab": "courses", "course_view": "participant", "customer_id": "p", "participant_layout": "courses"}])
def test_history_requires_an_explicit_customer_and_flat_course_view(values):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        PrincipalQuery(participant_history_organization_id="org", **values)
