from datetime import date, datetime
from types import SimpleNamespace

from app.api import statistics


def test_dashboard_endpoint_returns_expected_shape(client):
    response = client.get("/api/statistics/dashboard")

    assert response.status_code == 200
    assert set(response.json()) == {
        "month",
        "total_customers",
        "new_customers_this_month",
        "arrived_customers_this_month",
        "arrived_customers_last_month",
        "arrival_change_rate",
        "revenue_this_month",
        "transactions_this_month",
        "not_arrived_customers",
        "not_arrived_days",
    }


def test_dashboard_summary_uses_calendar_month_and_recent_contacts(monkeypatch):
    customers = [
        SimpleNamespace(id="c1", nickname="近期到店", created_at=datetime(2026, 7, 3)),
        SimpleNamespace(id="c2", nickname="很久未到店", created_at=datetime(2026, 6, 20)),
        SimpleNamespace(id="c3", nickname="从未到店", created_at=datetime(2026, 7, 10)),
    ]
    monkeypatch.setattr(statistics.customer_service, "list_customers", lambda: customers)

    def arrived_ids(date_from: str, date_to: str):
        if date_from == "2026-07-01":
            return {"c1", "c2"}
        if date_from == "2026-07-04":
            return {"c1"}
        return {"c1"}

    monkeypatch.setattr(statistics.visit_service, "get_arrived_customer_ids", arrived_ids)

    payments = [
        SimpleNamespace(deal_date="2026-07-05", amount=398, voided=False),
        SimpleNamespace(deal_date="2026-07-08", price=1000, voided=False),
        SimpleNamespace(deal_date="2026-07-09", fee=500, voided=True),
        SimpleNamespace(deal_date="2026-06-30", amount=200, voided=False),
    ]
    monkeypatch.setattr(statistics, "_payment_record_groups", lambda: [payments])

    result = statistics._build_dashboard_summary(date(2026, 7, 18))

    assert result["total_customers"] == 3
    assert result["new_customers_this_month"] == 2
    assert result["arrived_customers_this_month"] == 2
    assert result["arrived_customers_last_month"] == 1
    assert result["arrival_change_rate"] == 100.0
    assert result["revenue_this_month"] == 1398.0
    assert result["transactions_this_month"] == 2
    assert result["not_arrived_customers"] == 2
    assert result["not_arrived_days"] == 14
