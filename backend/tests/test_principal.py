from datetime import date
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.api import principal as principal_api
from app.models.custom_analysis import AnalysisCondition
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
    assert result["summary"]["符合条件人数"] == 1
    assert result["summary"]["转化人数"] == 1
    assert result["summary"]["转化成交笔数"] == 2


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


def test_source_condition_filters_cohort():
    """「从」上的客户条件用来筛人：不满足就不进这批人。"""
    rule = ConversionRule(source=ConversionAction(kind="coarse_usage", occurrence="first", conditions=[
        AnalysisCondition(field="member_type", operator="eq", value="会员"),
    ]))
    events = [source(), event("p", "2026-01-03")]
    matched = calculate_conversion(events, rule, {"a"}, "2026-01-01", "2026-01-31",
                                   customer_rows={"c1": {"id": "c1", "member_type": "会员"}})
    assert matched["summary"]["符合条件人数"] == 1
    assert matched["summary"]["转化人数"] == 1
    skipped = calculate_conversion(events, rule, {"a"}, "2026-01-01", "2026-01-31",
                                   customer_rows={"c1": {"id": "c1", "member_type": "非会员"}})
    assert skipped["summary"]["符合条件人数"] == 0
    assert skipped["summary"]["转化人数"] == 0


def test_target_has_no_conditions():
    """筛选条件只加在「从」上，「到」只描述什么算转化。"""
    with pytest.raises(ValueError):
        ConversionRule(targets=[ConversionAction(kind="purchase", product="membership", occurrence="first", conditions=[
            AnalysisCondition(field="payment_closers", operator="is_not_empty"),
        ])])


def test_target_rejects_customer_field_condition():
    """客户属性条件只加在「从」上，「到」只接订单类字段，避免重复配置。"""
    with pytest.raises(ValueError):
        ConversionRule(targets=[ConversionAction(kind="purchase", product="membership", conditions=[
            AnalysisCondition(field="customer_tags", operator="in", value=["高意向"]),
        ])])
    with pytest.raises(ValueError):
        ConversionRule(targets=[ConversionAction(kind="purchase", product="membership", conditions=[
            AnalysisCondition(field="gender", operator="eq", value="女"),
        ])])


def test_unsupported_or_misplaced_conditions_rejected():
    # 消费金额等第一批未开放的字段直接拒绝
    with pytest.raises(ValueError):
        ConversionRule(source=ConversionAction(conditions=[AnalysisCondition(field="payment_amount_period", operator="gt", value=0)]))
    # 成交人只能加在「到」一侧
    with pytest.raises(ValueError):
        ConversionRule(source=ConversionAction(conditions=[AnalysisCondition(field="payment_closers", operator="in", value=["小王"])]))
    # 客户属性只能加在「从」一侧
    with pytest.raises(ValueError):
        ConversionRule(targets=[ConversionAction(conditions=[AnalysisCondition(field="gender", operator="eq", value="女")])])


def test_specific_card_type_and_repeat():
    rule = ConversionRule(targets=[ConversionAction(kind="purchase", product="membership", subtype="398会员", occurrence="repeat")])
    events = [event("old", "2025-12-01"), source(), event("wrong", "2026-01-02", subtype="年卡")]
    assert calculate(events, rule)["summary"]["转化人数"] == 0
    events.append(event("right", "2026-01-04"))
    assert calculate(events, rule)["summary"]["转化人数"] == 1


def test_first_source_uses_history_not_selected_period():
    assert calculate([source(day="2025-12-01"), source("s2"), event("p", "2026-01-03")])["summary"]["符合条件人数"] == 0


def test_usage_not_transaction_count():
    rule = ConversionRule(targets=[ConversionAction(kind="coarse_usage", occurrence="repeat")])
    result = calculate([source(), source("s2", "2026-01-02")], rule)
    assert result["summary"]["转化人数"] == 1
    assert result["summary"]["转化成交笔数"] == 0


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


def test_scope_data_viewer_views_all_organizations(monkeypatch):
    """全局配置的「整体数据查阅人」默认属于每个组织，可查看全部组织的经营数据。"""
    from app.services import organization_data_viewer_service

    request = NS(state=NS(user_id="account", user_role="员工"))
    orgs = [NS(id="a", name="A", member_ids=["c1"]), NS(id="b", name="B", member_ids=["c2"])]
    people = [NS(id="c1", nickname="甲", name=""), NS(id="c2", nickname="乙", name="")]
    monkeypatch.setattr(service.organization_service, "list_organizations", lambda: orgs)
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: people)
    monkeypatch.setattr(service.account_service, "get_account", lambda _: NS(owner="甲"))
    monkeypatch.setattr(service.position_edit_permission_service, "get_permissions", lambda _: {"principal_scope": "own"})
    monkeypatch.setattr(service.customer_access_service, "visible_customer_ids", lambda *_: {"c1", "c2"})

    # 未配置整体数据查阅人时仍只看本人所在组织
    monkeypatch.setattr(organization_data_viewer_service, "is_data_viewer", lambda _cid: False)
    assert [o.id for o in service.scope(request)[0]] == ["a"]

    # 配置为整体数据查阅人后，等同于每个组织的成员
    monkeypatch.setattr(organization_data_viewer_service, "is_data_viewer", lambda cid: cid == "c1")
    assert [o.id for o in service.scope(request)[0]] == ["a", "b"]

    # 归属人姓名匹配到多个客户时不扩大范围（与普通成员同一套保守口径）
    people.append(NS(id="c3", nickname="甲", name=""))
    assert service.scope(request)[0] == []


def test_all_referral_organization_keeps_courses_and_orders_scoped(monkeypatch):
    """「全员引流归属」只影响引流：课程与交易仍按各自组织归属。"""
    request = NS(state=NS(user_role="超级管理员"))
    orgs = [
        NS(id="all", name="无忧茶院", member_ids=[], referrer_mode="all", referrer_ids=[]),
        NS(id="club", name="要脸俱乐部", member_ids=[], referrer_mode="member", referrer_ids=[]),
    ]
    events = [
        event("p1", "2026-01-05", org="club"),
        event("p2", "2026-01-06", org="all"),
    ]
    monkeypatch.setattr(
        service,
        "collect_data",
        lambda _: (orgs, {"customer_access": {"transaction_access": "detail"}}, events, []),
    )

    tea_house = service.analyze(
        request, PrincipalQuery(tab="orders", organization_id="all", date_from=date(2026, 1, 1))
    )
    assert tea_house["summary"]["交易笔数"] == 1

    club = service.analyze(
        request, PrincipalQuery(tab="orders", organization_id="club", date_from=date(2026, 1, 1))
    )
    assert club["summary"]["交易笔数"] == 1


def test_overview_referrals_use_all_customers_for_all_referral_organization(monkeypatch):
    """无忧茶院这类组织按全员算引流；普通俱乐部只算自己成员带来的引流；空引流人归「未配置」。"""
    def customer(cid, nickname, referrer=""):
        return NS(id=cid, nickname=nickname, name="", referrer=referrer, referral_date="2026-01-05", member_type="",
                  follow_up_status="", traffic_source="")

    request = NS(state=NS(user_id="acc", user_role="超级管理员"))
    orgs = [
        NS(id="all", name="无忧茶院", member_ids=[], referrer_mode="all", referrer_ids=[]),
        NS(id="club", name="要脸俱乐部", member_ids=["staff-club"], referrer_mode="member", referrer_ids=[]),
    ]
    customers = {
        item.id: item
        for item in (
            customer("staff-club", "婷婷"),
            customer("staff-all", "余墨"),
            customer("c1", "客户一", "婷婷"),
            customer("c2", "客户二", "余墨"),
        )
    }
    permissions = {"customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], []))
    monkeypatch.setattr(service, "scope", lambda _: (orgs, customers, permissions))
    # 引流归属的人名用完整客户表解析（不受当前账号可见范围影响）
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: list(customers.values()))

    tea_house = service.analyze(
        request, PrincipalQuery(tab="overview", organization_id="all", date_from=date(2026, 1, 1))
    )
    # 全员引流：2 个有引流人的 + 2 个空引流人（未配置）
    assert tea_house["summary"]["引流人数"] == 4
    assert any(item["key"] == "未配置" and item["count"] == 2 for item in tea_house["breakdown"]["traffic"])

    club = service.analyze(
        request, PrincipalQuery(tab="overview", organization_id="club", date_from=date(2026, 1, 1))
    )
    # 俱乐部：婷婷带来的 1 人 + 空引流人 2 人（未配置）
    assert club["summary"]["引流人数"] == 3


def test_overview_referrals_only_count_configured_referrers(monkeypatch):
    """组织配置成「指定人员」时，只有这些人的引流计入该组织的引流统计。"""
    def customer(cid, nickname, referrer=""):
        return NS(id=cid, nickname=nickname, name="", referrer=referrer, referral_date="2026-01-05",
                  member_type="", follow_up_status="", traffic_source="")

    request = NS(state=NS(user_id="acc", user_role="超级管理员"))
    orgs = [NS(id="org", name="要脸俱乐部", member_ids=["staff-ting"],
               referrer_mode="selected", referrer_ids=["staff-yumo"])]
    customers = {
        item.id: item
        for item in (
            customer("staff-ting", "婷婷", "外部"),
            customer("staff-yumo", "余墨", "外部"),
            customer("c1", "客户一", "婷婷"),
            customer("c2", "客户二", "余墨"),
        )
    }
    permissions = {"customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], []))
    monkeypatch.setattr(service, "scope", lambda _: (orgs, customers, permissions))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: list(customers.values()))

    result = service.analyze(
        request, PrincipalQuery(tab="overview", organization_id="org", date_from=date(2026, 1, 1))
    )
    assert result["summary"]["引流人数"] == 1
    assert [item["key"] for item in result["breakdown"]["traffic"]] == ["余墨"]


def test_overview_referrals_can_exclude_unassigned_customers(monkeypatch):
    """关闭「包含未配置引流人」后，没填引流人的客户不再计入该组织。"""
    def customer(cid, nickname, referrer=""):
        return NS(id=cid, nickname=nickname, name="", referrer=referrer, referral_date="2026-01-05",
                  member_type="", follow_up_status="", traffic_source="")

    request = NS(state=NS(user_id="acc", user_role="超级管理员"))
    orgs = [NS(id="org", name="无忧茶院", member_ids=[], referrer_mode="all", referrer_ids=[],
               include_unassigned_referrers=False)]
    customers = {
        item.id: item
        for item in (
            customer("staff", "婷婷", "外部"),
            customer("c1", "客户一", "婷婷"),
            customer("c2", "客户二"),
        )
    }
    permissions = {"customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], []))
    monkeypatch.setattr(service, "scope", lambda _: (orgs, customers, permissions))

    result = service.analyze(
        request, PrincipalQuery(tab="overview", organization_id="org", date_from=date(2026, 1, 1))
    )
    assert result["summary"]["引流人数"] == 1
    assert [item["key"] for item in result["breakdown"]["traffic"]] == ["婷婷"]


def test_overview_traffic_profile_fields_follow_role_permissions(monkeypatch):
    """引流客户列表里的档案字段（到访目的 / 创伤经历 / 当下卡点 / 工作情况 / 其他信息）按角色权限下发。"""
    customers = {
        "staff": NS(id="staff", nickname="婷婷", name="", referrer="", referral_date="2026-01-01",
                    member_type="", follow_up_status="", traffic_source=""),
        "c1": NS(
            id="c1", nickname="客户一", name="", referrer="婷婷", referral_date="2026-01-05",
            member_type="30次卡", follow_up_status="跟进中", traffic_source="朋友圈", referrer_handler="苏晴",
            tags="想改善睡眠", basic_info="童年创伤", assessment="", core_situation="卡在亲密关系",
            work_status="自由职业", work_description="做设计", other_info="有小孩",
        ),
    }
    request = NS(state=NS(user_id="acc", user_role="普通角色"))
    orgs = [NS(id="org", name="要脸俱乐部", member_ids=[], referrer_mode="all", referrer_ids=[])]
    permissions = {"customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], []))
    monkeypatch.setattr(service, "scope", lambda _: (orgs, customers, permissions))
    monkeypatch.setattr(service.customer_access_service, "get_customer_permissions", lambda role: {"sensitive_fields": {
        "visit_purpose": True, "trauma_history": False, "current_block": False,
        "work_info": True, "other_info": False,
    }})

    result = service.analyze(request, PrincipalQuery(tab="overview", organization_id="org", date_from=date(2026, 1, 1)))
    assert result["breakdown"]["traffic_profile_fields"] == ["visit_purpose", "work_info"]
    entry = next(item for item in result["breakdown"]["traffic"] if item["key"] == "婷婷")["customers"][0]
    assert entry["referrer_handler"] == "苏晴"
    assert entry["visit_purpose"] == "想改善睡眠"
    assert entry["work_info"] == "自由职业 · 做设计"
    # 没权限的字段不出现在返回里，前端也就不会出现在列表设置里
    assert "trauma_history" not in entry
    assert "current_block" not in entry
    assert "other_info" not in entry


def test_overview_traffic_profile_fields_use_core_situation_fallback(monkeypatch):
    """当下卡点在 PC 端叫 assessment，小程序叫 core_situation，两个都没填才是空。"""
    customers = {
        "staff": NS(id="staff", nickname="婷婷", name="", referrer="", referral_date="2026-01-01",
                    member_type="", follow_up_status="", traffic_source=""),
        "c1": NS(
            id="c1", nickname="客户一", name="", referrer="婷婷", referral_date="2026-01-05",
            member_type="", follow_up_status="", traffic_source="", referrer_handler="",
            tags="", basic_info="", assessment="PC 端填的卡点", core_situation="小程序填的卡点",
            work_status="", work_description="", other_info="",
        ),
    }
    request = NS(state=NS(user_id="acc", user_role="普通角色"))
    orgs = [NS(id="org", name="要脸俱乐部", member_ids=[], referrer_mode="all", referrer_ids=[])]
    permissions = {"customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], []))
    monkeypatch.setattr(service, "scope", lambda _: (orgs, customers, permissions))
    monkeypatch.setattr(service.customer_access_service, "get_customer_permissions", lambda role: {"sensitive_fields": {
        "visit_purpose": False, "trauma_history": False, "current_block": True,
        "work_info": False, "other_info": False,
    }})

    result = service.analyze(request, PrincipalQuery(tab="overview", organization_id="org", date_from=date(2026, 1, 1)))
    entry = next(item for item in result["breakdown"]["traffic"] if item["key"] == "婷婷")["customers"][0]
    assert entry["current_block"] == "PC 端填的卡点"


def test_analyze_filters_orders_and_hides_internal_fields(monkeypatch):
    request = NS(state=NS(user_role="超级管理员"))
    orgs = [NS(id="a", name="A")]
    events = [event("p0", "2025-12-01"), event("p1", "2026-01-02"), event("p2", "2026-01-03", product="group_case")]
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, {"customer_access": {"transaction_access": "detail"}}, events, []))
    result = service.analyze(request, PrincipalQuery(tab="orders", date_from=date(2026, 1, 1)))
    assert result["summary"]["交易笔数"] == 2
    assert "同类复购人数" not in result["summary"]
    assert {r["classification"] for r in result["items"]} == {"同类复购", "跨品类首购"}
    # 金额与内部关联字段不出 API；客户 id 要带上，前端靠它打开客户详情
    assert all("price" not in r and "organization_id" not in r and "course_key" not in r for r in result["items"])
    assert all(r["customer_id"] for r in result["items"])


def test_rules_persist_and_soft_delete(client):
    response = client.post("/api/principal/rules", json=ConversionRule().model_dump())
    assert response.status_code == 200, response.text
    rule_id = response.json()["id"]
    assert any(r["id"] == rule_id for r in client.get("/api/principal/rules").json())
    assert client.patch(f"/api/principal/rules/{rule_id}", json=ConversionRule(window_days=7).model_dump()).json()["rule"]["window_days"] == 7
    assert client.delete(f"/api/principal/rules/{rule_id}").status_code == 200
    assert all(r["id"] != rule_id for r in client.get("/api/principal/rules").json())


def test_rules_keep_filter_range(client):
    """规则要连当时的筛选范围（组织 + 统计周期）一起保存。"""
    payload = ConversionRule(name="带范围的规则", organization_id="org-1",
                             date_from="2026-09-01", date_to="2026-09-30").model_dump()
    response = client.post("/api/principal/rules", json=payload)
    assert response.status_code == 200, response.text
    rule_id = response.json()["id"]
    try:
        record = next(r for r in client.get("/api/principal/rules").json() if r["id"] == rule_id)
        assert record["rule"]["organization_id"] == "org-1"
        assert record["rule"]["date_from"] == "2026-09-01"
        assert record["rule"]["date_to"] == "2026-09-30"
    finally:
        client.delete(f"/api/principal/rules/{rule_id}")
    # 日期格式不对要拦下来
    assert client.post("/api/principal/rules", json={**payload, "date_from": "2026/9/1"}).status_code == 422


def test_rules_keep_description_and_scope(client):
    payload = ConversionRule(name="共享口径", description="给组长看的说明", scope="shared").model_dump()
    response = client.post("/api/principal/rules", json=payload)
    assert response.status_code == 200, response.text
    rule_id = response.json()["id"]
    try:
        record = next(r for r in client.get("/api/principal/rules").json() if r["id"] == rule_id)
        assert record["rule"]["description"] == "给组长看的说明"
        assert record["rule"]["scope"] == "shared"
        assert record["can_manage"] is True
        assert record["owner_name"]
        updated = client.patch(f"/api/principal/rules/{rule_id}", json=ConversionRule(name="共享口径", description="改过的说明", scope="private").model_dump()).json()
        assert updated["rule"]["scope"] == "private"
        assert client.patch(f"/api/principal/rules/{rule_id}", json={**payload, "description": "   "}).json()["rule"]["description"] == ""
    finally:
        client.delete(f"/api/principal/rules/{rule_id}")


def test_shared_rule_visible_to_others_but_locked(client):
    response = client.post("/api/principal/rules", json=ConversionRule(name="团队共享口径", scope="shared").model_dump())
    rule_id = response.json()["id"]
    other = NS(state=NS(user_id="other-account", user_role="店长", user_roles=["店长"]))
    try:
        listed = principal_api.list_rules(other)
        record = next(r for r in listed if r["id"] == rule_id)
        assert record["can_manage"] is False
        assert principal_api.readable_rule(rule_id, other)["owner_id"] != "other-account"
        with pytest.raises(HTTPException) as error:
            principal_api.update_rule(rule_id, ConversionRule(name="改别人的"), other)
        assert error.value.status_code == 403
        with pytest.raises(HTTPException) as error:
            principal_api.delete_rule(rule_id, other)
        assert error.value.status_code == 403
    finally:
        client.delete(f"/api/principal/rules/{rule_id}")


def test_private_rule_hidden_from_others(client):
    response = client.post("/api/principal/rules", json=ConversionRule(name="只给自己的口径").model_dump())
    rule_id = response.json()["id"]
    other = NS(state=NS(user_id="other-account", user_role="店长", user_roles=["店长"]))
    try:
        assert all(r["id"] != rule_id for r in principal_api.list_rules(other))
        with pytest.raises(HTTPException) as error:
            principal_api.readable_rule(rule_id, other)
        assert error.value.status_code == 404
    finally:
        client.delete(f"/api/principal/rules/{rule_id}")


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


def test_rule_fields_endpoint_exposes_first_batch(client):
    response = client.get("/api/principal/rule-fields")
    assert response.status_code == 200, response.text
    data = response.json()
    names = [field["value"] for field in data["fields"]]
    assert names == ["gender", "age", "member_type", "follow_up_status", "customer_tags", "traffic_source",
                     "referrer", "referrer_handler", "service_teacher", "referral_date", "invitation_dates"]
    # 消费金额、期间成交金额等仍未开放
    assert "total_consumption" not in names and "payment_amount_period" not in names
    assert all(field["operators"] for field in data["fields"])
    assert any(item["value"] == "between" for item in data["operators"])


def test_conversion_query_with_condition_runs(client):
    """带客户条件的转化查询要走通整条链路（含客户档案表构建）。"""
    body = {
        "tab": "conversion",
        "rule": {
            "name": "测试：女性客户转化",
            "source": {"kind": "coarse_usage", "occurrence": "first", "conditions": [
                {"field": "member_type", "operator": "eq", "value": "会员"},
            ]},
            "targets": [{"kind": "purchase", "product": "membership", "occurrence": "first"}],
        },
    }
    response = client.post("/api/principal/query", json=body)
    assert response.status_code == 200, response.text
    summary = response.json()["summary"]
    assert "符合条件人数" in summary and "观察已完成人数" in summary


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


@pytest.mark.parametrize("mode,expected", [
    # 内部人员＝被该组织/俱乐部的引流人引流来的客户；其余都是组织外的人员
    ("member", {"c1": "内部人员", "c2": "外部人员", "c3": "外部人员"}),
    ("selected", {"c1": "外部人员", "c2": "内部人员", "c3": "外部人员"}),
    ("all", {"c1": "内部人员", "c2": "内部人员", "c3": "外部人员"}),
])
def test_course_participants_use_referrer_configuration(mode, expected):
    def person(cid, nickname, referrer=""):
        return NS(id=cid, nickname=nickname, name="", referrer=referrer)

    org = NS(id="a", member_ids=["staff-ting"], referrer_ids=["staff-yumo"], referrer_mode=mode)
    all_people = {
        "staff-ting": person("staff-ting", "婷婷"),
        "staff-yumo": person("staff-yumo", "余墨"),
        "c1": person("c1", "客户一", "婷婷"),
        "c2": person("c2", "客户二", "余墨"),
        "c3": person("c3", "客户三"),
    }
    course = {"id": "lesson", "organization_id": "a", "organization": "甲", "name": "公益",
              "participant_ids": ["c1", "c2", "c3"], "participant_names": [("c1", "同名"), ("c2", "同名")]}
    rows = service.course_participant_rows([course], [org], customers=all_people)
    assert {r["customer_id"]: r["participant_category"] for r in rows} == expected
    for category, label in [("internal", "内部人员"), ("external", "外部人员")]:
        filtered = service.course_participant_rows([course], [org], category, all_people)
        assert {r["customer_id"] for r in filtered} == {cid for cid, value in expected.items() if value == label}
    assert service.course_participant_rows([course], []) == []


def test_course_participants_pagination_export_and_course_scope(monkeypatch):
    def person(cid, nickname, referrer=""):
        return NS(id=cid, nickname=nickname, name="", referrer=referrer)

    orgs = [NS(id="a", member_ids=["staff-a"], referrer_mode="member"),
            NS(id="b", member_ids=["staff-b"], referrer_mode="member")]
    people = [person("staff-a", "甲引流"), person("staff-b", "乙引流"),
              person("c1", "甲", "甲引流"), person("c2", "乙", "乙引流")]
    courses = [{"id": oid, "date": "2026-01-01", "organization_id": oid, "organization": oid,
                "name": "公益", "type": "沙龙活动", "activity_type": "class", "hours": 0,
                "participant_ids": ["c1", "c2"], "participants": 2,
                "participant_names": [("c1", "甲"), ("c2", "乙")]}
               for oid in ("a", "b")]
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, {"customer_access": {"transaction_access": "summary"}}, [], courses))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: people)
    monkeypatch.setattr(service.upsell_config_service, "level_order", lambda: [])
    query = PrincipalQuery(tab="courses", course_view="participant", participant_scope="internal", page_size=1)
    result = service.analyze(NS(), query)
    assert result["total"] == 2
    assert len(result["items"]) == 1
    exported = service.analyze(NS(), query, export=True)
    assert {(r["organization"], r["customer_id"]) for r in exported["items"]} == {("a", "c1"), ("b", "c2")}
    assert all(r["hours"] == 0 for r in exported["items"])
    assert "participant_ids" not in exported["items"][0]
    assert not any(c["key"] in {"order_count", "same_day_deals"} for c in exported["columns"])
    query.organization_id = "a"
    assert service.analyze(NS(), query)["total"] == 1
    query.activity_type = "ics"
    assert service.analyze(NS(), query)["total"] == 0
    query.activity_type = ""
    query.course_view = "course"
    original = service.analyze(NS(), query)
    assert original["total"] == 1
    assert original["items"][0]["participants"] == 2


def test_rule_ownership_is_enforced(monkeypatch):
    from app.api import principal
    monkeypatch.setattr(principal, "load_item", lambda *_: {"id": "r", "owner_id": "another", "rule": {"scope": "private"}})
    other = NS(state=NS(user_id="me", user_role="店长", user_roles=["店长"]))
    # 别人的私有规则连看都看不到
    with pytest.raises(HTTPException) as error:
        principal.readable_rule("r", other)
    assert error.value.status_code == 404
    # 共享规则能看到，但改不了
    monkeypatch.setattr(principal, "load_item", lambda *_: {"id": "r", "owner_id": "another", "rule": {"scope": "shared"}})
    monkeypatch.setattr(principal, "save_item", lambda *_: None)
    with pytest.raises(HTTPException) as error:
        principal.manageable_rule("r", other)
    assert error.value.status_code == 403


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


def test_traffic_export_uses_visible_customers_and_selected_order(client, monkeypatch):
    import io

    from openpyxl import load_workbook

    def analyze(_request, query, export=False):
        assert export and query.tab == "overview"
        return {"columns": [], "items": [], "total": 0, "breakdown": {"traffic": [
            {"label": "老师甲", "customers": [
                {"id": "a", "name": "客户甲", "tags": ["新客"], "deals": 2},
                {"id": "b", "name": "=1+1", "tags": [], "deals": 0},
            ]},
        ]}}

    monkeypatch.setattr(service, "analyze", analyze)
    response = client.post("/api/principal/export", json={
        "export_view": "traffic", "export_customer_ids": ["b", "invisible", "a", "b"],
    })
    assert response.status_code == 200
    sheet = load_workbook(io.BytesIO(response.content)).active
    assert sheet.max_row == 3
    assert sheet["A1"].value == "昵称"
    assert sheet["A2"].value == "'=1+1"
    assert sheet["A3"].value == "客户甲"
    assert sheet["C3"].value == "老师甲"
    assert sheet["I3"].value == 2
    empty = client.post("/api/principal/export", json={
        "export_view": "traffic", "export_customer_ids": [],
    })
    assert load_workbook(io.BytesIO(empty.content)).active.max_row == 1


def test_deadline_today_is_still_observing():
    result = calculate([source()], ConversionRule(window_days=0), today=date(2026, 1, 1))
    assert result["summary"]["观察中"] == 1
    assert result["summary"]["观察已完成人数"] == 0


def test_whitespace_rule_name_rejected(client):
    response = client.post("/api/principal/rules", json={"name": "   "})
    assert response.status_code == 422
    assert ConversionRule(name="  测试  ").name == "测试"
