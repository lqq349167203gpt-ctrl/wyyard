from datetime import date
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.principal import ConversionAction, ConversionRule, PrincipalQuery
from app.services import principal_service as service
from app.services.principal_conversion_service import calculate_conversion


def event(eid, day, customer="c1", org="a", kind="purchase", product="membership", subtype="398会员"):
    return {"id": eid, "date": day, "customer_id": customer, "customer": customer,
            "organization_id": org, "organization": org, "kind": kind, "product": product,
            "subtype": subtype, "label": product, "closers": ""}


def source(eid="s", day="2026-01-01", **kwargs):
    return event(eid, day, kind="coarse_usage", product="coarse", subtype="", **kwargs)


def calculate(events, rule=None, start="2026-01-01", end="2026-01-31", today=date(2026, 3, 1)):
    return calculate_conversion(events, rule or ConversionRule(), {"a"}, start, end, today)


def test_conversion_deduplicates_people_and_orders():
    result = calculate([source(), source("s2", "2026-01-02"), event("p1", "2026-01-03"), event("p2", "2026-01-03")])
    assert result["summary"]["起点人数"] == 1
    assert result["summary"]["转化人数"] == 1
    assert result["summary"]["目标交易笔数"] == 2


def test_target_can_be_after_selected_period():
    result = calculate([source(), event("p", "2026-01-20")], end="2026-01-02")
    assert result["summary"]["转化人数"] == 1


@pytest.mark.parametrize("day", ["2025-12-31", "2026-02-02"])
def test_target_must_follow_source_within_window(day):
    assert calculate([source(), event("p", day)])["summary"]["转化人数"] == 0


def test_same_day_zero_day_window_is_flagged():
    result = calculate([source(), event("p", "2026-01-01")], ConversionRule(window_days=0))
    assert result["items"][0]["same_day"] == "同日转化（不代表因果）"


def test_cross_org_opt_in():
    events = [source(), event("p", "2026-01-03", org="b")]
    assert calculate(events)["summary"]["转化人数"] == 0
    assert calculate(events, ConversionRule(same_organization=False))["summary"]["转化人数"] == 1


def test_observing_and_mature_denominators():
    result = calculate([source(), source("s2", "2026-01-30", customer="c2"), event("p", "2026-01-02")], today=date(2026, 2, 1))
    assert result["summary"]["观察中"] == 1
    assert result["summary"]["转化率"] == "50.0%"
    assert result["summary"]["完整观察期转化率"] == "100.0%"


def test_all_targets_require_every_group():
    rule = ConversionRule(target_mode="all", targets=[ConversionAction(kind="purchase", product="membership"), ConversionAction(kind="purchase", product="group_case")])
    events = [source(), event("p", "2026-01-02")]
    assert calculate(events, rule)["summary"]["转化人数"] == 0
    events.append(event("p2", "2026-01-04", product="group_case"))
    assert calculate(events, rule)["summary"]["转化人数"] == 1


def test_source_order_cannot_convert_itself():
    action = ConversionAction(kind="purchase", occurrence="any")
    rule = ConversionRule(source=action, targets=[action])
    assert calculate([event("p", "2026-01-02")], rule)["summary"]["转化人数"] == 0


def test_specific_card_type_and_repeat():
    rule = ConversionRule(targets=[ConversionAction(kind="purchase", product="membership", subtype="398会员", occurrence="repeat")])
    events = [event("old", "2025-12-01"), source(), event("wrong", "2026-01-02", subtype="年卡")]
    assert calculate(events, rule)["summary"]["转化人数"] == 0
    events.append(event("right", "2026-01-04"))
    assert calculate(events, rule)["summary"]["转化人数"] == 1


def test_first_source_uses_history_not_selected_period():
    assert calculate([source(day="2025-12-01"), source("s2"), event("p", "2026-01-03")])["summary"]["起点人数"] == 0


def test_usage_not_transaction_count():
    rule = ConversionRule(targets=[ConversionAction(kind="coarse_usage", occurrence="repeat")])
    result = calculate([source(), source("s2", "2026-01-02")], rule)
    assert result["summary"]["转化人数"] == 1
    assert result["summary"]["目标交易笔数"] == 0


def test_future_events_excluded():
    assert calculate([source(), event("p", "2026-01-20")], today=date(2026, 1, 10))["summary"]["转化人数"] == 0


def test_scope_own_and_ambiguous_owner_fail_closed(monkeypatch):
    request = NS(state=NS(user_id="account", user_role="员工"))
    orgs = [NS(id="a", name="A", member_ids=["c1"]), NS(id="b", name="B", member_ids=["c2"])]
    people = [NS(id="c1", nickname="甲", name=""), NS(id="c2", nickname="乙", name="")]
    monkeypatch.setattr(service.organization_service, "list_organizations", lambda: orgs)
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: people)
    monkeypatch.setattr(service.account_service, "get_account", lambda _: NS(owner="甲"))
    monkeypatch.setattr(service.position_edit_permission_service, "get_permissions", lambda _: {"principal_scope": "own"})
    monkeypatch.setattr(service.customer_access_service, "visible_customer_ids", lambda *_: {"c1", "c2"})
    assert [o.id for o in service.scope(request)[0]] == ["a"]
    people[1].nickname = "甲"
    assert service.scope(request)[0] == []
    with pytest.raises(HTTPException):
        service.selected_orgs([orgs[0]], "b")


def test_analyze_filters_orders_and_hides_internal_fields(monkeypatch):
    request = NS(state=NS(user_role="超级管理员"))
    orgs = [NS(id="a", name="A")]
    events = [event("p0", "2025-12-01"), event("p1", "2026-01-02"), event("p2", "2026-01-03", product="group_case")]
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, {"customer_access": {"transaction_access": "detail"}}, events, []))
    result = service.analyze(request, PrincipalQuery(tab="orders", date_from=date(2026, 1, 1)))
    assert result["summary"]["交易笔数"] == 2
    assert result["summary"]["同类复购人数"] == 1
    assert {r["classification"] for r in result["items"]} == {"同类复购", "跨品类首购"}
    assert all("customer_id" not in r and "price" not in r for r in result["items"])


def test_rules_persist_and_soft_delete(client):
    response = client.post("/api/principal/rules", json=ConversionRule().model_dump())
    assert response.status_code == 200, response.text
    rule_id = response.json()["id"]
    assert any(r["id"] == rule_id for r in client.get("/api/principal/rules").json())
    assert client.patch(f"/api/principal/rules/{rule_id}", json=ConversionRule(window_days=7).model_dump()).json()["rule"]["window_days"] == 7
    assert client.delete(f"/api/principal/rules/{rule_id}").status_code == 200
    assert all(r["id"] != rule_id for r in client.get("/api/principal/rules").json())


def test_query_and_export_reject_unauthorized_org(client):
    body = {"organization_id": "not-permitted"}
    for endpoint in ("query", "export"):
        response = client.post(f"/api/principal/{endpoint}", json=body)
        assert response.status_code == 403, response.text


def test_metadata_and_empty_query_work(client):
    assert client.get("/api/principal/metadata").status_code == 200
    result = client.post("/api/principal/query", json={})
    assert result.status_code == 200, result.text
    assert "课时数" in result.json()["summary"]


def test_invalid_window_and_range_rejected(client):
    assert client.post("/api/principal/rules", json={"window_days": -1}).status_code == 422
    assert client.post("/api/principal/query", json={"date_from": "2026-02-01", "date_to": "2026-01-01"}).status_code == 422


def test_collector_uses_course_org_and_excludes_hidden_voided_and_withdrawn(monkeypatch):
    from app.api import statistics
    from app.models.class_record import ClassRecord

    request = NS(state=NS(user_role="超级管理员"))
    org = NS(id="a", name="甲组织", member_ids=[])
    people = {cid: NS(id=cid, nickname=cid, name="") for cid in ("c1", "c2", "c3")}
    permissions = {"principal_scope": "all", "customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(service, "scope", lambda _: ([org], people, permissions))
    monkeypatch.setattr(service.organization_service, "list_organizations", lambda: [org, NS(id="b", name="乙组织", member_ids=["teacher"])])
    monkeypatch.setattr(service.course_service, "list_courses", lambda: [NS(id="course", organization_id="a")])
    monkeypatch.setattr(service.course_type_service, "list_course_types", lambda: [])
    course = ClassRecord(id="course-record", date="2026-01-01", course_id="course", course_name="公益", teacher_ids=["teacher"], participant_ids=["c1", "c2", "c3", "hidden"], withdrawn_participant_ids=["c2"], membership_deduction_count=0, created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z")
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (("class", "沙龙活动", lambda: [course]),))
    monkeypatch.setattr(service.visit_service, "get_arrived_customer_ids", lambda *_: {"c1", "c2", "hidden"})
    payments = [NS(id="zero", customer_id="c1", organization_id="a", deal_date="2026-01-02", card_type="398会员", price=0),
                NS(id="hidden", customer_id="hidden", organization_id="a"),
                NS(id="foreign", customer_id="c1", organization_id="b"),
                NS(id="void", customer_id="c1", organization_id="a", voided=True),
                NS(id="undated", customer_id="c1", organization_id="a", deal_date=None)]
    monkeypatch.setattr(service, "PRODUCTS", (("membership", "会员卡", lambda: payments, "card_type"),))
    monkeypatch.setattr(service.project_deduction_service, "list_deductions", lambda: [])
    _, _, events, courses = service.collect_data(request)
    assert courses[0]["organization_id"] == "a"  # 不是老师所在的乙组织
    assert courses[0]["hours"] == 0
    assert courses[0]["participant_ids"] == ["c1"]
    assert [e["id"] for e in events if e["kind"] == "purchase"] == ["purchase:membership:zero"]


def test_rule_ownership_is_enforced(monkeypatch):
    from app.api import principal
    monkeypatch.setattr(principal, "load_item", lambda *_: {"id": "r", "owner_id": "another"})
    with pytest.raises(HTTPException) as error:
        principal.owned_rule("r", NS(state=NS(user_id="me")))
    assert error.value.status_code == 404


def test_page_permission_is_required(monkeypatch):
    from app.middleware.jwt_auth import require_page_permission
    from app.services import position_permission_service
    monkeypatch.setattr(position_permission_service, "get_permissions", lambda _: [])
    with pytest.raises(HTTPException) as error:
        require_page_permission("principal")(NS(state=NS(user_role="普通角色")))
    assert error.value.status_code == 403


def test_summary_permission_cannot_access_conversion(monkeypatch):
    request = NS(state=NS(user_role="summary-only"))
    monkeypatch.setattr(service, "collect_data", lambda _: ([], {"customer_access": {"transaction_access": "summary"}}, [], []))
    monkeypatch.setattr(service.customer_access_service, "transaction_access", lambda _: "summary")
    for tab in ("orders", "conversion"):
        with pytest.raises(HTTPException):
            service.analyze(request, PrincipalQuery(tab=tab), export=True)


def test_export_wraps_details_and_escapes_formula(client, monkeypatch):
    import io

    from openpyxl import load_workbook

    monkeypatch.setattr(service, "analyze", lambda *_, **__: {
        "columns": [{"key": "customer", "label": "客户"}],
        "items": [{"customer": "=1+1", "details": ["甲", "乙"]}], "total": 1,
    })
    response = client.post("/api/principal/export", json={})
    assert response.status_code == 200
    sheet = load_workbook(io.BytesIO(response.content)).active
    assert sheet["A2"].value == "'=1+1"
    assert sheet["B2"].value == "甲\n乙"
    assert sheet["B2"].alignment.wrap_text


def test_deadline_today_is_still_observing():
    result = calculate([source()], ConversionRule(window_days=0), today=date(2026, 1, 1))
    assert result["summary"]["观察中"] == 1
    assert result["summary"]["观察期已结束人数"] == 0
