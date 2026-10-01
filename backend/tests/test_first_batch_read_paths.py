"""第一批治理：轻量列表兼容性、全局排序和邀约余量的一致性。"""

from datetime import date
from types import SimpleNamespace

from app.api import customers
from app.services import internal_course_service, membership_card_service, visit_service


def test_customer_list_view_skips_unused_calculation(client, created_customer, monkeypatch):
    def unused(*args, **kwargs):
        raise AssertionError("PC 列表不应计算金额或卡次")

    monkeypatch.setattr(customers, "_build_payment_totals", unused)
    monkeypatch.setattr(membership_card_service, "list_current_card_remaining", unused)
    response = client.get("/api/customers", params={
        "nickname": created_customer["nickname"], "page": 1, "page_size": 10, "list_view": True,
    })
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["id"] == created_customer["id"]
    assert "transaction_count" in item
    assert "total_payment" not in item
    assert "card_remaining" not in item


def test_customer_list_view_preserves_global_sort_and_default_fields(client, monkeypatch):
    ids = [client.post("/api/customers", json={"nickname": f"精简列表排序{i}"}).json()["id"] for i in range(3)]
    monkeypatch.setattr(customers, "_build_transaction_counts", lambda: dict(zip(ids, [1, 9, 3])))
    params = {"nickname": "精简列表排序", "page": 2, "page_size": 1, "sort_by": "transaction_count", "sort_order": "desc"}
    regular = client.get("/api/customers", params=params).json()
    slim = client.get("/api/customers", params={**params, "list_view": True}).json()
    assert regular["items"][0]["id"] == slim["items"][0]["id"] == ids[2]
    assert regular["total"] == slim["total"] == 3
    assert "total_payment" in regular["items"][0]
    assert "card_remaining" in regular["items"][0]


def test_invitation_remaining_keeps_unlimited_and_internal_course_rules(monkeypatch):
    monkeypatch.setattr(membership_card_service, "list_current_card_remaining", lambda ids: {
        "multiple": 13, "unlimited": "unlimited", "internal": 0, "expired": 0,
    })
    today = date.today().isoformat()
    monkeypatch.setattr(internal_course_service, "list_courses", lambda: [
        SimpleNamespace(customer_id="internal", effective_date=today, expiry_date=today),
        SimpleNamespace(customer_id="expired", effective_date="2000-01-01", expiry_date="2000-02-01"),
    ])
    assert visit_service.current_remaining_by_customer({"multiple", "unlimited", "internal", "expired", "none"}) == {
        "multiple": 13, "unlimited": -999, "internal": -999, "expired": 0, "none": 0,
    }


def test_visit_create_update_and_lists_return_same_remaining(client, created_customer, monkeypatch):
    customer_id = created_customer["id"]
    value = [13]
    monkeypatch.setattr(membership_card_service, "list_current_card_remaining", lambda ids: {customer_id: value[0]})
    day = "2026-01-22"
    created = client.post("/api/visits", json={"customer_id": customer_id, "visit_date": day})
    assert created.status_code == 200
    assert created.json()["remaining_count"] == 13
    visit_id = created.json()["id"]
    for path in (f"/api/visits/{visit_id}", f"/api/visits?date={day}", f"/api/visits/light?date={day}"):
        response = client.get(path)
        assert response.status_code == 200
        payload = response.json()
        item = next(row for row in payload if row["id"] == visit_id) if isinstance(payload, list) else payload
        assert item["remaining_count"] == 13
    value[0] = 8
    updated = client.patch(f"/api/visits/{visit_id}", json={"visit_time": "10:30"})
    assert updated.status_code == 200
    assert updated.json()["remaining_count"] == 8
