from copy import deepcopy
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest

from app.models.membership_card import MembershipCard
from app.models.principal import PrincipalQuery
from app.models.upsell_config import PURCHASE_RULE_LABELS, PurchaseRule
from app.services import course_workflow_service, principal_mobile_service, principal_service, upsell_config_service
from app.services.storage import load_data, save_data


@pytest.fixture(autouse=True)
def isolated_rules(monkeypatch):
    from app.services import course_type_service
    monkeypatch.setattr(course_type_service, "_types", [{"name": "读书会", "category": "salon"}])
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
    assert by_id["a"]["purchase_rule_keys"] == []
    assert by_id["a"]["purchase_rule_conflicts"] == ["conversion", "upsell", "repurchase"]
    assert by_id["a"]["classification"] == "规则冲突"
    assert by_id["card30"]["repeat_times"] == 1
    assert by_id["card30"]["purchase_rule_keys"] == ["conversion"]
    assert by_id["third"]["purchase_rule_keys"] == ["repurchase"]
    assert by_id["fourth"]["repeat_times"] == 4
    assert len(principal_service.apply_breakdown_picks(events, ["buy:升单"])) == 0
    assert len(principal_service.apply_breakdown_picks(events, ["buy:复购"])) == 2


def test_legacy_overlap_keeps_independent_stages_and_flags_core_conflict():
    events = [purchase("one", "2026-01-02")]
    upsell_config_service.classify_purchases(events, rules_with(**{key: [condition("membership:体验会员")] for key in PURCHASE_RULE_LABELS}))
    assert events[0]["purchase_rule_keys"] == ["experience", "assessment"]
    assert events[0]["classification"] == "体验、梳理、规则冲突"


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
    monkeypatch.setattr(course_workflow_service, "stage_events", lambda: [dict(e, invalid=False) for e in deepcopy(events)])
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
    from app.services import organization_service
    if not any(org.name == "无忧茶院" for org in organization_service.list_organizations()):
        response = client.post("/api/organizations", json={"name": "无忧茶院", "member_ids": []})
        assert response.status_code == 200, response.text
    response = client.post("/api/offline-courses", json={"closer_name": "测试成交人", "customer_id": created_customer["id"], "nickname": created_customer["nickname"], "course_type": course_type, "deal_course_key": "", "deal_course_name": "", "effective_date": "2026-01-01", "validity_value": 3})
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
    assert by_id['trial']['purchase_rule_keys']==['conversion']
    assert by_id['exp']['purchase_rule_keys']==[]
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
    assert saved[3]['previous_stage'] == 'conversion'
    assert saved[4]['previous_stage'] == 'upsell'
    assert saved[1]['once'] is True and saved[3]['once'] is True
    assert saved[0]['conditions'][1]['event_kind'] == 'attendance'
    assert saved[0]['conditions'][1]['public_welfare_only'] is True
    assert saved[2]['conditions'][0]['products'] == ['oh']
    saved[2]['conditions'][0]['previous_products']=['invalid']
    assert client.put('/api/upsell-config',json={'rules':saved}).status_code==400


def test_saved_rules_invalidate_analysis_cache_and_count_big_orders_before_period(client, monkeypatch):
    events = [purchase('exp', '2026-01-01'),
              purchase('big', '2026-01-02', product='energy', subtype=''),
              purchase('online', '2026-02-03', product='online_tea', subtype='')]
    permissions = {'customer_access': {'transaction_access': 'detail'}}
    monkeypatch.setattr(principal_service, 'collect_data', lambda _: ([NS(id='org', name='小院')], permissions, deepcopy(events), []))
    monkeypatch.setattr(course_workflow_service, "stage_events", lambda: [dict(e, invalid=False) for e in deepcopy(events)])
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
    assert [event["purchase_rule_keys"] for event in events] == ([["conversion"], [], ["upsell"], ["repurchase"]] if low == "membership:次卡" else [["experience"], ["conversion"], ["upsell"], ["repurchase"]])
    direct_big = [events[0], purchase("big-direct", "2026-01-03", subtype="30次卡")]
    upsell_config_service.classify_purchases(direct_big, upsell_config_service.recommended_rules())
    assert direct_big[-1]["purchase_rule_keys"] == (["upsell"] if low == "membership:次卡" else ["conversion"])


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
    assert outcomes["198 单次 → 398"] == "其他成交"
    assert outcomes["公益读书会"] == "体验"
    assert outcomes["OH卡诊断"] == "梳理"
    assert outcomes["首次买陪伴营"] == "转化"
    assert outcomes["粗门次卡 → 首次买大单"] == "转化"
    assert outcomes["398 → 再买 398"] == "其他成交"
    assert outcomes["398 → 30 次卡 → 60 次卡"] == "复购"
    assert outcomes["大单 → 次卡 → 首次买 398"] == "其他成交"
    assert load_data(upsell_config_service.UPSELL_FILE) == before
    rules[2]["conditions"][0]["excluded_previous_products"] = ["invalid"]
    assert client.put("/api/upsell-config", json={"rules": rules}).status_code == 400


@pytest.mark.parametrize("items,expected", [
    (["group_case", "energy", "online_tea", "offline"], ["转化", "升单", "复购", "复购"]),
    (["membership:体验会员", "membership:体验会员", "energy", "membership:次卡", "online_tea"], ["转化", "其他成交", "升单", "其他成交", "复购"]),
    (["coarse", "coarse", "group_case", "membership:体验会员", "energy", "online_tea"], ["体验", "体验", "转化", "其他成交", "升单", "复购"]),
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


def test_recommended_experience_only_coarse_and_public_book_attendance():
    rules = upsell_config_service.recommended_rules()
    experience = next(r for r in rules if r['key'] == 'experience')
    assert experience['conditions'][0]['products'] == ['coarse']
    from app.services.course_rule_catalog import book_club_key
    assert experience['conditions'][1]['products'] == [book_club_key()]
    assert experience['conditions'][1]['public_welfare_only'] is True


@pytest.mark.parametrize('low', ['membership:次卡', 'coarse'])
@pytest.mark.parametrize('target', ['membership:体验会员', 'membership:30次卡', 'group_case', 'energy', 'online_tea', 'offline'])
def test_recommended_next_purchase_after_198_or_coarse(low, target):
    events = [purchase('low', '2026-01-01', product=low.partition(':')[0], subtype=low.partition(':')[2]),
              purchase('target', '2026-01-02', product=target.partition(':')[0], subtype=target.partition(':')[2])]
    upsell_config_service.classify_purchases(events, upsell_config_service.recommended_rules())
    assert events[0]['purchase_rule_keys'] == (['conversion'] if low == 'membership:次卡' else ['experience'])
    expected = ([] if target == 'membership:体验会员' else ['upsell']) if low == 'membership:次卡' else ['conversion']
    assert events[1]['purchase_rule_keys'] == expected


def test_recommended_rules_feed_the_same_low_card_target_to_course_tasks():
    from app.services.course_workflow_service import _target

    for low in ['membership:次卡', 'coarse']:
        events = [purchase('low', '2026-01-01', product=low.partition(':')[0], subtype=low.partition(':')[2])]
        assert _target(events, upsell_config_service.recommended_rules(), 'c1', '2026-01-02') == ('upsell' if low == 'membership:次卡' else 'conversion', '')


@pytest.mark.parametrize('prefix', [[], ['coarse'], ['coarse', 'coarse']])
@pytest.mark.parametrize('regular,expected', [
    (['membership:体验会员', 'membership:30次卡', 'energy'], ['conversion', 'upsell', 'repurchase']),
    (['membership:30次卡', 'energy', 'online_tea'], ['conversion', 'upsell', 'repurchase']),
])
def test_default_paths_keep_conversion_upsell_repurchase_exclusive(prefix, regular, expected):
    items = prefix + regular
    events = [purchase(str(i), f'2026-01-{i + 1:02d}', product=item.partition(':')[0], subtype=item.partition(':')[2])
              for i, item in enumerate(items)]
    upsell_config_service.classify_purchases(events, upsell_config_service.recommended_rules())
    assert [e['purchase_rule_keys'] for e in events] == [['experience'] for _ in prefix] + [[key] for key in expected]


def test_default_preview_and_saved_rules_match_both_entry_paths(client):
    original = load_data(upsell_config_service.UPSELL_FILE)
    draft = client.get('/api/upsell-config').json()['recommended_rules']
    previews = client.post('/api/upsell-config/preview', json={'rules': draft})
    assert previews.status_code == 200, previews.text
    results = {row['journey']: row['classification'] for row in previews.json()['items']}
    assert results['大单 → 大单'] == '升单'
    assert results['大单 → 大单 → 大单'] == '复购'
    assert results['198 单次 → 398'] == '其他成交'
    assert results['198 单次 → 398 → 大单'] == '升单'
    assert results['198 单次 → 大单 → 陪伴营'] == '复购'
    assert results['粗门次卡 → 首次买大单'] == '转化'
    assert results['OH卡诊断 → 首次买大单'] == '转化'
    assert load_data(upsell_config_service.UPSELL_FILE) == original
    saved = client.put('/api/upsell-config', json={'rules': draft})
    assert saved.status_code == 200, saved.text
    upsell_config_service._load()
    loaded = client.get('/api/upsell-config').json()
    assert loaded['configured'] and loaded['rules'] == draft
    assert upsell_config_service.preview_rules(loaded['rules']) == previews.json()['items']


def attendance(id, day, *, public=True, subtype="读书会", customer="c1"):
    return {**purchase(id, day, product="class", subtype=subtype, customer=customer),
            "kind": "attendance", "is_public_welfare": public, "course_key": f"class:{id}"}


def test_public_attendance_and_assessment_do_not_advance_purchase_stages():
    events = [attendance("public", "2026-01-01"),
              purchase("oh1", "2026-01-02", product="oh", subtype=""),
              purchase("198", "2026-01-03", subtype="次卡"),
              purchase("398", "2026-01-04"),
              purchase("oh2", "2026-01-05", product="oh", subtype=""),
              purchase("camp", "2026-01-06", product="companion_camp", subtype=""),
              purchase("tea", "2026-01-07", product="online_tea", subtype="")]
    upsell_config_service.classify_purchases(events, upsell_config_service.recommended_rules())
    assert [e["classification"] for e in events] == ["体验", "梳理", "转化", "其他成交", "梳理", "升单", "复购"]
    for e in [attendance("paid", "2026-01-01", public=False), attendance("other", "2026-01-01", subtype="沙龙")]:
        upsell_config_service.classify_purchases([e], upsell_config_service.recommended_rules())
        assert e["purchase_rule_keys"] == []


def test_attendance_does_not_consume_first_purchase_or_purchase_history():
    rules = rules_with(experience=[{"event_kind": "attendance", "product": "class:读书会", "operator": "eq", "count": 1}],
                       conversion=[{**condition("membership:次卡"), "first_purchase": True}])
    events = [attendance("public", "2026-01-01"), purchase("198", "2026-01-02", subtype="次卡")]
    upsell_config_service.classify_purchases(events, rules)
    assert events[0]["purchase_rule_keys"] == ["experience"]
    assert events[1]["purchase_rule_keys"] == ["conversion"]


def test_new_rule_validation_and_legacy_four_rules(client):
    rules = rules_with(experience=[condition("coarse")])
    legacy = [r for r in rules if r["key"] != "assessment"]
    saved = client.put("/api/upsell-config", json={"rules": legacy})
    assert saved.status_code == 200, saved.text
    assert saved.json()["rules"] == rules
    assert client.put("/api/upsell-config", json={"rules": [*legacy, legacy[0]]}).status_code == 422
    for key, patch, status in [
        ("conversion", {"event_kind": "attendance", "product": "class:读书会"}, 422),
        ("experience", {"event_kind": "attendance", "product": "class:不存在"}, 400),
        ("experience", {"event_kind": "purchase", "product": "class:读书会"}, 400),
        ("experience", {"event_kind": "attendance", "product": "class:读书会", "first_purchase": True}, 422),
    ]:
        bad = rules_with(**{key: [{**condition("coarse"), **patch}]})
        assert client.put("/api/upsell-config", json={"rules": bad}).status_code == status


def test_attendance_stage_history_uses_confirmed_roster_and_never_adds_orders(monkeypatch):
    from app.services import class_record_service, course_attendance_service, visit_service
    from app.services import course_workflow_service as workflow
    records = [NS(id="public", date="2026-01-01", course_type="读书会", is_public_welfare=True, is_deleted=False),
               NS(id="deleted", date="2026-01-01", course_type="读书会", is_public_welfare=True, is_deleted=True)]
    from app.api import statistics
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", [("class", "沙龙活动", lambda: records)])
    monkeypatch.setattr(class_record_service, "list_records", lambda: records)
    monkeypatch.setattr(course_attendance_service, "snapshot", lambda: {})
    monkeypatch.setattr(visit_service, "get_arrived_customer_ids_by_date", lambda: {})
    monkeypatch.setattr(class_record_service, "_get_group_member_ids", lambda *a: {"c1", "not-attended"})
    monkeypatch.setattr(course_attendance_service, "attended_ids", lambda *a, **kw: {"c1", "not-registered"})
    orders = [{**purchase("198", "2026-01-02", subtype="次卡"), "invalid": False}]
    monkeypatch.setattr(workflow, "all_orders", lambda: list(orders))
    events = workflow.stage_events()
    assert len(events) == 2
    assert events[-1]["customer_id"] == "c1"
    rules = upsell_config_service.recommended_rules()
    rules[1]["previous_stage"] = "experience"
    upsell_config_service.classify_purchases(events, rules)
    assert events[-1]["classification"] == "体验"
    assert events[0]["classification"] == "转化"
    assert len(workflow.all_orders()) == 1


def test_assessment_order_filter_and_attendance_not_in_order_totals(monkeypatch):
    rules = upsell_config_service.recommended_rules()
    monkeypatch.setattr(upsell_config_service, "_rules", [PurchaseRule(**r) for r in rules])
    events = [attendance("public", "2026-01-01"), purchase("oh", "2026-01-02", product="oh", subtype=""),
              purchase("camp", "2026-01-03", product="companion_camp", subtype="")]
    monkeypatch.setattr(principal_service, "collect_data", lambda _: ([NS(id="org", name="小院")], {"customer_access": {"transaction_access": "detail"}}, deepcopy(events), []))
    monkeypatch.setattr(course_workflow_service, "stage_events", lambda: [dict(e, invalid=False) for e in deepcopy(events)])
    request = NS(state=NS(user_id="acc", user_role="超级管理员"))
    query = PrincipalQuery(tab="orders", organization_id="org", date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
    result = principal_service.analyze(request, query)
    assert result["total"] == 2
    result = principal_service.analyze(request, query.model_copy(update={"order_filter": "assessment"}))
    assert result["total"] == 1
    assert result["items"][0]["classification"] == "梳理"


@pytest.mark.parametrize("scope", ["subtype", "group"])
def test_first_public_class_ignores_non_public_attendance(scope):
    rules = rules_with(experience=[{"event_kind": "attendance", "product": "class:读书会", "public_welfare_only": True,
                                   "operator": "eq", "count": 1, "count_scope": scope}])
    events = [attendance("paid", "2026-01-01", public=False), attendance("public", "2026-01-02"), attendance("public2", "2026-01-03")]
    upsell_config_service.classify_purchases(events, rules)
    assert [e["purchase_rule_keys"] for e in events] == [[], ["experience"], []]


def test_public_class_counts_experience_people_in_pc_and_mobile_without_deals(monkeypatch):
    org = NS(id="org", name="无忧茶院", member_ids=[], referrer_mode="all", referrer_ids=[])
    customers = {cid: NS(id=cid, nickname=name, name="", referrer=ref, referral_date="2026-01-01",
                         member_type="", follow_up_status="", traffic_source="")
                 for cid, name, ref in [("staff", "老师", ""), ("c1", "甲", "老师"), ("c2", "乙", "老师")]}
    permissions = {"customer_access": {"transaction_access": "detail"}}
    events = [attendance("public1", "2026-01-02"), attendance("public2", "2026-01-03"),
              purchase("oh", "2026-01-04", product="oh", subtype="", customer="c2")]
    monkeypatch.setattr(upsell_config_service, "_rules", [PurchaseRule(**r) for r in upsell_config_service.recommended_rules()])
    monkeypatch.setattr(principal_service, "scope", lambda _: ([org], customers, permissions))
    monkeypatch.setattr(principal_service.customer_service, "list_customers", lambda: list(customers.values()))
    monkeypatch.setattr(principal_service, "collect_data", lambda _: ([org], permissions, deepcopy(events), []))
    monkeypatch.setattr(course_workflow_service, "stage_events", lambda: [dict(e, invalid=False) for e in deepcopy(events)])
    request = NS(state=NS(user_id="acc", user_role="超级管理员"))
    query = PrincipalQuery(tab="overview", organization_id="org", date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
    breakdown = principal_service.analyze(request, query)["breakdown"]
    group = next(row for row in breakdown["traffic"] if row["key"] == "老师")
    c1 = next(c for c in group["customers"] if c["id"] == "c1")
    assert c1["deals"] == 0
    assert [level["key"] for level in c1["upsell_levels"]] == ["experience"]
    assert {r["id"] for r in principal_mobile_service.selected_customers(breakdown, ["upsell:experience"])} == {"c1"}
    assert {r["id"] for r in principal_mobile_service.selected_customers(breakdown, ["upsell:assessment"])} == {"c2"}
    mobile = principal_mobile_service.compact_breakdown(breakdown)
    assert next(row for row in mobile["traffic"] if row["key"] == "老师")["trial_count"] == 1


def test_empty_new_assessment_preserves_legacy_classification_and_target(monkeypatch):
    from app.services import course_workflow_service as work
    rules = upsell_config_service.recommended_rules()
    rules[2]["conditions"] = []
    legacy = [r for r in rules if r["key"] != "assessment"]
    monkeypatch.setattr(upsell_config_service, "_rules", [PurchaseRule(**r) for r in legacy])
    # 保持已保存规则的模拟结果，与新增空规则的结果一致。
    events = [purchase("first", "2026-01-01", subtype="次卡"), purchase("big", "2026-01-02", subtype="30次卡")]
    upsell_config_service.classify_purchases(events, legacy)
    previous = [e["classification"] for e in events]
    upsell_config_service.classify_purchases(events, upsell_config_service.list_rules())
    assert [e["classification"] for e in events] == previous
    assert work._target(events, legacy, "c1", "2026-01-03") == work._target(events, upsell_config_service.list_rules(), "c1", "2026-01-03")


def test_stale_four_rule_client_cannot_erase_configured_assessment(client):
    rules = upsell_config_service.recommended_rules()
    saved = client.put("/api/upsell-config", json={"rules": rules})
    assert saved.status_code == 200, saved.text
    legacy = [r for r in rules if r["key"] != "assessment"]
    response = client.put("/api/upsell-config", json={"rules": legacy})
    assert response.status_code == 409
    assert upsell_config_service.list_rules() == rules
