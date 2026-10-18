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
