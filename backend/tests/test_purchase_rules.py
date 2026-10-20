from copy import deepcopy
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest

from app.models.membership_card import MembershipCard
from app.models.principal import PrincipalQuery
from app.models.upsell_config import PURCHASE_RULE_LABELS, PurchaseRule
from app.services import principal_mobile_service, principal_service, upsell_config_service
from app.services.storage import load_data, save_data


@pytest.fixture(autouse=True)
def isolated_rules(monkeypatch):
    previous = load_data(upsell_config_service.UPSELL_FILE)
    monkeypatch.setattr(upsell_config_service, "_rules", None)
    monkeypatch.setattr(upsell_config_service, "_levels", [])
    yield
    save_data(upsell_config_service.UPSELL_FILE, previous)


def rules_with(**conditions):
    return [{"key": key, "conditions": conditions.get(key, [])} for key in PURCHASE_RULE_LABELS]


def condition(product, count=1, operator="eq"):
    return {"product": product, "operator": operator, "count": count}


def purchase(id, day, subtype="体验会员", product="membership", at="", customer="c1"):
    return {"id": id, "date": day, "recorded_at": at, "subtype": subtype, "product": product,
            "customer_id": customer, "customer": customer, "organization_id": "org", "organization": "小院",
            "kind": "purchase", "label": subtype, "closers": ""}


def test_subtype_counts_same_day_and_overlapping_rules():
    events = [purchase("a", "2026-01-02", at="2026-01-02T12:00:00Z"),
              purchase("z", "2026-01-02", at="2026-01-02T09:00:00Z"),
              purchase("card30", "2026-01-02", subtype="30次卡"),
              purchase("third", "2026-01-03"), purchase("fourth", "2026-01-04")]
    rules = rules_with(
        experience=[condition("membership:体验会员")],
        conversion=[condition("membership:30次卡"), condition("membership:体验会员", 2)],
        upsell=[condition("membership:体验会员", 2)],
        repurchase=[condition("membership:体验会员", 2, "gte")],
    )
    upsell_config_service.classify_purchases(events, rules)
    by_id = {event["id"]: event for event in events}
    assert by_id["z"]["purchase_rule_keys"] == ["experience"]
    assert by_id["a"]["purchase_rule_keys"] == ["conversion", "upsell", "repurchase"]
    assert by_id["card30"]["repeat_times"] == 1
    assert by_id["card30"]["purchase_rule_keys"] == ["conversion"]
    assert by_id["third"]["purchase_rule_keys"] == ["repurchase"]
    assert by_id["fourth"]["repeat_times"] == 4
    assert len(principal_service.apply_breakdown_picks(events, ["buy:升单"])) == 1
    assert len(principal_service.apply_breakdown_picks(events, ["buy:复购"])) == 3


def test_one_purchase_can_match_all_four_rules():
    events = [purchase("one", "2026-01-02")]
    upsell_config_service.classify_purchases(events, rules_with(**{key: [condition("membership:体验会员")] for key in PURCHASE_RULE_LABELS}))
    assert events[0]["purchase_rule_keys"] == list(PURCHASE_RULE_LABELS)


def test_config_validates_persists_and_logs_chinese_details(client):
    options = client.get("/api/upsell-config").json()
    keys = {item["key"] for item in options["products"]}
    assert {"membership:定制化", "internal:疗愈师课程：自爱力构建", "offline:主理人训练", "offline:商业落地三个月", "offline:商业落地一年"} <= keys
    assert not {"membership:年卡", "membership:月卡"} & keys
    rules = rules_with(experience=[condition("membership:体验会员")], repurchase=[condition("offline:主理人训练", 2, "gte")])
    response = client.put("/api/upsell-config", json={"rules": rules})
    assert response.status_code == 200, response.text
    assert response.json()["configured"] is True
    upsell_config_service._load()
    assert upsell_config_service.list_rules() == rules
    bad = deepcopy(rules)
    bad[0]["conditions"][0]["product"] = "membership:不存在"
    assert client.put("/api/upsell-config", json={"rules": bad}).status_code == 400
    bad = deepcopy(rules)
    bad[0]["conditions"][0]["count"] = 0
    assert client.put("/api/upsell-config", json={"rules": bad}).status_code == 422
    assert client.put("/api/upsell-config", json={"rules": rules[:3]}).status_code == 422
    from app.services import operation_log_service
    log = next(log for log in operation_log_service.list_logs() if "更新购买规则" in log.content)
    assert "体验：会员卡 · 体验会员·第1次" in log.content
    assert log.after_data["复购"][0] == {"付费项目": "线下落地课程 · 主理人训练", "购买次数": "第2次及以上"}
    assert client.put("/api/upsell-config", json={"levels": []}).status_code == 409


def test_historical_card_rename_keeps_entitlements():
    now = datetime.now(timezone.utc)
    for card_type, total, remaining in (("月卡", None, None), ("12次卡", 12, 7), ("自定义旧卡", 23, 9)):
        old = {"id": card_type, "customer_id": "c", "nickname": "甲", "card_type": card_type,
               "price": 123, "effective_date": "2026-01-01", "duration_type": "month", "duration_value": 6,
               "expiry_date": "2026-06-30", "total_count": total, "remaining_count": remaining,
               "created_at": now, "updated_at": now}
        card = MembershipCard(**old)
        assert card.card_type == "定制化"
        for key in ("price", "total_count", "remaining_count", "duration_type", "duration_value", "expiry_date"):
            assert getattr(card, key) == old[key]
        assert old["card_type"] == card_type


def test_reporting_period_does_not_reset_purchase_count(monkeypatch):
    rules = rules_with(experience=[condition("membership:体验会员")], repurchase=[condition("membership:体验会员", 2, "gte")])
    monkeypatch.setattr(upsell_config_service, "_rules", [PurchaseRule(**rule) for rule in rules])
    org = NS(id="org", name="小院")
    events = [purchase("first", "2025-12-01"), purchase("second", "2026-01-02"), purchase("third", "2026-02-01")]
    permissions = {"customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(principal_service, "collect_data", lambda _: ([org], permissions, deepcopy(events), []))
    request = NS(state=NS(user_id="acc", user_role="超级管理员"))
    response = principal_service.analyze(request, PrincipalQuery(tab="orders", organization_id="org", date_from=date(2026, 1, 1), date_to=date(2026, 1, 31)))
    assert len(response["items"]) == 1
    assert response["items"][0]["classification"] == "复购"


def test_mobile_rule_filters_allow_multiple_matches():
    customer = {"id": "c", "referrer": "老师", "deals": 1, "upsell_levels": [{"key": "experience"}, {"key": "upsell"}]}
    breakdown = {"purchase_rules_configured": True, "traffic": [{"label": "老师", "customers": [customer]}],
                 "traffic_upsell_levels": [{"key": "experience", "label": "体验"}, {"key": "upsell", "label": "升单"}]}
    assert len(principal_mobile_service.selected_customers(breakdown, ["upsell:experience"])) == 1
    assert principal_mobile_service.compact_breakdown(breakdown)["traffic"][0]["trial_count"] == 1


@pytest.mark.parametrize("course_type", ["主理人训练", "商业落地三个月", "商业落地一年"])
def test_offline_course_subtypes_roundtrip_and_filter(client, created_customer, course_type):
    response = client.post("/api/offline-courses", json={"customer_id": created_customer["id"], "nickname": created_customer["nickname"], "course_type": course_type, "effective_date": "2026-01-01", "validity_value": 3})
    assert response.status_code == 200, response.text
    assert response.json()["course_type"] == course_type
    items = client.get("/api/offline-courses", params={"customer_ids": created_customer["id"], "course_type": course_type}).json()
    assert len(items) == 1
    assert items[0]["course_type"] == course_type
    invalid = client.patch(f"/api/offline-courses/{response.json()['id']}", json={"course_type": "错误类型"})
    assert invalid.status_code == 400


def test_recommended_journey_supports_first_big_prerequisite_and_cross_product_repeat():
    events = [purchase('trial','2026-01-01',subtype='次卡'),
              purchase('exp','2026-01-02'),
              purchase('big','2026-01-03',subtype='30次卡'),
              purchase('cross','2026-01-04',product='energy',subtype=''),
              purchase('online','2026-01-05',product='online_tea',subtype=''),
              purchase('direct','2026-01-01',product='emotional',subtype='',customer='direct'),
              purchase('direct-second','2026-01-02',product='offline',subtype='主理人训练',customer='direct')]
    upsell_config_service.classify_purchases(events, upsell_config_service.recommended_rules())
    by_id={item['id']:item for item in events}
    assert by_id['trial']['purchase_rule_keys']==['experience']
    assert by_id['exp']['purchase_rule_keys']==['conversion']
    assert by_id['big']['purchase_rule_keys']==['upsell']
    assert by_id['cross']['purchase_rule_keys']==['repurchase']
    assert by_id['online']['purchase_rule_keys']==['repurchase']
    assert by_id['direct']['purchase_rule_keys']==['conversion']
    assert by_id['direct-second']['purchase_rule_keys']==['upsell']
    assert by_id['cross']['repeat_times']==1  # 同类次数不冒充跨项目次数。


def test_reverse_sequence_does_not_make_prior_upsell_and_trial_is_not_a_big_order():
    events=[purchase('a','2026-01-01',product='energy',subtype=''),purchase('b','2026-01-02'),
            purchase('c','2026-01-03',subtype='次卡'),purchase('d','2026-01-04',subtype='60次卡')]
    upsell_config_service.classify_purchases(events, upsell_config_service.recommended_rules())
    assert events[0]['purchase_rule_keys']==['conversion']
    assert events[1]['purchase_rule_keys']==[]
    assert events[2]['purchase_rule_keys']==[]
    assert events[3]['purchase_rule_keys']==['upsell']


def test_advanced_rules_roundtrip_validated_without_activating_on_read(client):
    response=client.get('/api/upsell-config').json()
    assert response['configured'] is False
    rules=response['recommended_rules']
    assert 'online_tea' in {item['key'] for item in response['products']}
    response=client.put('/api/upsell-config',json={'rules':rules})
    assert response.status_code==200,response.text
    upsell_config_service._load()
    saved=upsell_config_service.list_rules()
    assert saved[3]['conditions'][0]['count_scope']=='group'
    assert saved[2]['previous_stage'] == 'conversion'
    assert saved[3]['previous_stage'] == 'upsell'
    assert saved[1]['once'] is True and saved[2]['once'] is True
    assert saved[0]['conditions'][0]['excluded_previous_products']
    saved[2]['conditions'][0]['previous_products']=['invalid']
    assert client.put('/api/upsell-config',json={'rules':saved}).status_code==400


def test_saved_rules_invalidate_analysis_cache_and_count_big_orders_before_period(client, monkeypatch):
    events = [purchase('exp', '2026-01-01'),
              purchase('big', '2026-01-02', product='energy', subtype=''),
              purchase('online', '2026-02-03', product='online_tea', subtype='')]
    permissions = {'customer_access': {'transaction_access': 'detail'}}
    monkeypatch.setattr(principal_service, 'collect_data', lambda _: ([NS(id='org', name='小院')], permissions, deepcopy(events), []))
    params = {'tab': 'orders', 'organization_id': 'org', 'date_from': '2026-02-01', 'date_to': '2026-02-28', 'order_filter': 'repurchase'}
    before = client.post('/api/principal/query', json=params)
    assert before.status_code == 200, before.text
    assert before.json()['total'] == 0
    saved = client.put('/api/upsell-config', json={'rules': upsell_config_service.recommended_rules()})
    assert saved.status_code == 200, saved.text
    after = client.post('/api/principal/query', json=params)
    assert after.status_code == 200, after.text
    assert after.json()['total'] == 1
    assert after.json()['items'][0]['classification'] == '复购'
    assert after.json()['items'][0]['product'] == 'online_tea'


@pytest.mark.parametrize("low", ["membership:次卡", "coarse"])
def test_low_price_customer_can_upgrade_twice_and_then_repurchase(low):
    product, _, subtype = low.partition(":")
    events = [purchase("low", "2026-01-01", product=product, subtype=subtype),
              purchase("entry", "2026-01-02"),
              purchase("big", "2026-01-03", subtype="30次卡"),
              purchase("repeat", "2026-01-04", subtype="60次卡")]
    upsell_config_service.classify_purchases(events, upsell_config_service.recommended_rules())
    assert [event["purchase_rule_keys"] for event in events] == [["experience"], ["conversion"], ["upsell"], ["repurchase"]]
    direct_big = [events[0], purchase("big-direct", "2026-01-03", subtype="30次卡")]
    upsell_config_service.classify_purchases(direct_big, upsell_config_service.recommended_rules())
    assert direct_big[-1]["purchase_rule_keys"] == ["conversion"]


def test_excluded_previous_project_matches_whole_category_before_current_purchase():
    rules = rules_with(upsell=[{"products": ["membership:体验会员"], "operator": "eq", "count": 1,
                               "previous_products": ["coarse"], "excluded_previous_products": ["energy"]}])
    events = [purchase("big", "2026-01-01", product="energy", subtype=""),
              purchase("low", "2026-01-02", product="coarse", subtype=""), purchase("entry", "2026-01-03")]
    upsell_config_service.classify_purchases(events, rules)
    assert events[-1]["purchase_rule_keys"] == []
    upsell_config_service.classify_purchases(events[1:], rules)
    assert events[-1]["purchase_rule_keys"] == ["upsell"]


def test_preview_is_read_only_and_rejects_invalid_exclusion(client):
    rules = upsell_config_service.recommended_rules()
    before = load_data(upsell_config_service.UPSELL_FILE)
    result = client.post("/api/upsell-config/preview", json={"rules": rules})
    assert result.status_code == 200, result.text
    outcomes = {row["journey"]: row["classification"] for row in result.json()["items"]}
    assert outcomes["次卡 → 首次买 398"] == "转化"
    assert outcomes["粗门次卡 → 首次买大单"] == "转化"
    assert outcomes["398 → 再买 398"] == "未匹配"
    assert outcomes["398 → 30 次卡 → 60 次卡"] == "复购"
    assert outcomes["大单 → 次卡 → 首次买 398"] == "未匹配"
    assert load_data(upsell_config_service.UPSELL_FILE) == before
    rules[2]["conditions"][0]["excluded_previous_products"] = ["invalid"]
    assert client.put("/api/upsell-config", json={"rules": rules}).status_code == 400


@pytest.mark.parametrize("items,expected", [
    (["group_case", "energy", "online_tea", "offline"], ["转化", "升单", "复购", "复购"]),
    (["membership:体验会员", "membership:体验会员", "energy", "membership:次卡", "online_tea"], ["转化", "未匹配", "升单", "未匹配", "复购"]),
    (["coarse", "coarse", "group_case", "membership:体验会员", "energy", "online_tea"], ["体验", "体验", "转化", "未匹配", "升单", "复购"]),
])
def test_stage_journeys_same_day_and_reordered_rules(items, expected):
    events = [purchase(str(i), "2026-01-01", product=item.partition(":")[0], subtype=item.partition(":")[2], at=f"2026-01-01T{i:02}:00:00Z") for i, item in enumerate(items)]
    upsell_config_service.classify_purchases(list(reversed(events)), list(reversed(upsell_config_service.recommended_rules())))
    assert [e["classification"] for e in events] == expected
    assert all(len(e["purchase_rule_keys"]) <= 1 for e in events)


def test_stage_dependencies_reject_cycles(client):
    rules = upsell_config_service.recommended_rules()
    rules[1]["previous_stage"] = "upsell"
    assert client.put("/api/upsell-config", json={"rules": rules}).status_code == 422


def test_coarse_purchase_survives_missing_course_attendance(monkeypatch):
    from app.api import statistics
    from app.services import course_service, course_type_service
    org = NS(id="org", name="小院", member_ids=[])
    permissions = {"customer_access": {"transaction_access": "detail"}}
    monkeypatch.setattr(principal_service, "scope", lambda _: ([org], {"c1": NS(nickname="甲", name="甲")}, permissions))
    monkeypatch.setattr(principal_service.organization_service, "list_organizations", lambda: [org])
    monkeypatch.setattr(course_service, "list_courses", lambda: [])
    monkeypatch.setattr(course_type_service, "list_course_types", lambda: [])
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", [])
    monkeypatch.setattr(principal_service, "PRODUCTS", [])
    base = dict(id="bound", project_name="粗门次卡", is_deleted=False, cancelled=False, customer_id="c1",
                source_organization_id="org", organization_id="org", deduction_date="2026-01-02",
                source_activity_date="2026-01-01", source_activity_type="class", source_activity_id="removed",
                source_activity_name="课程", count=2, closers=[], closer_name="", created_at="2026-01-02")
    rows = [NS(**base), NS(**{**base, "id": "cancelled", "cancelled": True}), NS(**{**base, "id": "outside", "source_organization_id": "private"})]
    monkeypatch.setattr(principal_service.project_deduction_service, "list_deductions", lambda: rows)
    events = principal_service.collect_data(NS())[2]
    assert len(events) == 1
    assert events[0]["id"] == "coarse:bound"
    assert events[0]["deal_date"] == "2026-01-02"
    permissions["customer_access"]["transaction_access"] = "none"
    assert principal_service.collect_data(NS())[2] == []
