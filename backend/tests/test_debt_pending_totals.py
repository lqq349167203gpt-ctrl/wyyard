import asyncio

from starlette.requests import Request

from app.api import debt_records


def test_pending_total_does_not_change_with_course_filter(monkeypatch):
    rows = [
        {"id": "a", "customer_id": "person", "status": "ok", "debt_count": 3, "new_count": 0},
        {"id": "b", "customer_id": "person", "status": "changed", "debt_count": 4, "new_count": 2},
        {"id": "c", "customer_id": "person", "status": "new", "debt_count": 1, "new_count": 1},
        {"id": "d", "customer_id": "hidden", "status": "new", "debt_count": 9, "new_count": 9},
    ]
    monkeypatch.setattr(debt_records, "_raw_records", lambda _: [])
    monkeypatch.setattr(debt_records.debt_review_service, "sync", lambda *_: rows)
    monkeypatch.setattr(debt_records.customer_access_service, "require_transaction_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(debt_records.customer_access_service, "filter_record_dicts", lambda _, items: [r for r in items if r["customer_id"] != "hidden"])
    request = Request({"type": "http"})
    for status in ("attention", "ok", "all"):
        result = asyncio.run(debt_records.list_debt_records(request, "membership_card", status))
        assert result["customer_pending_totals"] == {"person": 3}
        assert result["customer_debt_totals"] == {"person": 8}
    rows[1].update(status="ok", new_count=0)
    rows[2].update(status="ok", new_count=0)
    result = asyncio.run(debt_records.list_debt_records(request, "membership_card", "all"))
    assert result["customer_pending_totals"].get("person", 0) == 0
