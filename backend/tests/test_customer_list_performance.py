from types import SimpleNamespace

from app.api import customers
from app.services import visit_service


def test_visit_summary_matches_existing_count_and_date(monkeypatch):
    records = [
        ("a", "2026-09-01", True, False),
        ("a", "2026-09-01", True, False),
        ("a", "2026-09-02", False, False),
        ("a", "2026-09-03", True, True),
        ("b", "2026-09-04", True, False),
    ]
    monkeypatch.setattr(visit_service, "_visits", {
        str(i): SimpleNamespace(customer_id=cid, visit_date=day, arrived=arrived, is_deleted=deleted)
        for i, (cid, day, arrived, deleted) in enumerate(records)
    })
    summary = visit_service.customer_visit_summary({"a", "b", "missing"})
    for cid in summary:
        assert summary[cid] == (
            visit_service.count_customer_visits(cid),
            visit_service.get_last_visit_date(cid),
        )


def test_default_page_enriches_only_page_and_count_sort_remains_global(client, monkeypatch):
    ids = [
        client.post("/api/customers", json={"nickname": f"分页性能专用{i}"}).json()["id"]
        for i in range(3)
    ]
    original = customers._build_enriched_items
    calls = []

    def enrich(records):
        calls.append([record.id for record in records])
        return original(records)

    monkeypatch.setattr(customers, "_build_enriched_items", enrich)
    response = client.get("/api/customers", params={
        "nickname": "分页性能专用", "page": 1, "page_size": 1,
    })
    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert len(calls) == 1 and len(calls[0]) == 1
    calls.clear()
    monkeypatch.setattr(customers, "_build_transaction_counts", lambda: dict(zip(ids, [1, 9, 3])))
    response = client.get("/api/customers", params={
        "nickname": "分页性能专用", "page": 2, "page_size": 1,
        "sort_by": "transaction_count", "sort_order": "desc",
    })
    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == ids[2]
    assert set(calls[0]) == set(ids)
