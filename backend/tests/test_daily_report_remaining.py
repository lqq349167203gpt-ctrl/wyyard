"""当日销卡余量应使用当前流水余额，不能使用购买数或历史快照。"""

from app.api import daily_report
from app.services import membership_card_service


def test_report_uses_current_balances_without_changing_sources(monkeypatch):
    sources = {
        "membership-cards": [{"id": "card", "customer_id": "a", "remaining_count": 30}],
        "group-cases": [{"id": "g1", "customer_id": "a", "purchase_count": 8},
                        {"id": "g2", "customer_id": "a", "purchase_count": 5},
                        {"id": "void", "customer_id": "a", "voided": True}],
        "energy-knots": [{"id": "unlimited", "customer_id": "a"}],
    }
    values = {"card": 12, "g1": 2, "g2": 3, "unlimited": None}

    def fill(item, kind):
        item["effective_remaining"] = values[item["id"]]

    monkeypatch.setattr(daily_report, "fill_effective_remaining", fill)
    monkeypatch.setattr(membership_card_service, "get_effective_remaining", lambda _: 17)
    deductions = [{"project_type": "membership-cards", "project_id": "card", "remaining_after": 29},
                  {"project_type": "group-cases", "project_id": "g1", "remaining_after": 7},
                  {"project_type": "energy-knots", "project_id": "unlimited", "remaining_after": 1}]
    result = daily_report.report_remaining(sources, deductions)
    assert result["membership-cards"]["a"] == 17
    assert result["group-cases"]["a"] == 5
    assert result["energy-knots"]["a"] is None
    assert [item["current_remaining"] for item in deductions] == [12, 2, None]
    assert [item["remaining_after"] for item in deductions] == [29, 7, 1]
    assert sources["membership-cards"][0]["remaining_count"] == 30


def test_report_course_only_customer_uses_shared_entitlement(monkeypatch):
    monkeypatch.setattr(membership_card_service, "get_effective_remaining", lambda _: None)
    result = daily_report.report_remaining({"internal-courses": [{"customer_id": "a"}]}, [])
    assert "a" in result["membership-cards"]
    assert result["membership-cards"]["a"] is None
