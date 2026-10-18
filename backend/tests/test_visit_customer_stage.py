"""新老客户按邀约当天的历史实际到店判断，不依赖会员身份。"""

def test_visit_customer_stage_uses_arrival_before_selected_day(client, created_customer):
    customer_id = created_customer["id"]
    first = client.post("/api/visits", json={"visit_date": "2026-09-10", "customer_id": customer_id, "arrived": True}).json()
    later = client.post("/api/visits", json={"visit_date": "2026-09-11", "customer_id": customer_id}).json()
    earlier = client.post("/api/visits", json={"visit_date": "2026-09-09", "customer_id": customer_id}).json()
    for path in ("/api/visits", "/api/visits/light"):
        for visit, expected in ((earlier, True), (first, True), (later, False)):
            response = client.get(path, params={"date": visit["visit_date"]})
            assert response.status_code == 200
            row = next(item for item in response.json() if item["id"] == visit["id"])
            assert row["is_new_customer"] is expected
    assert client.patch(f"/api/visits/{first['id']}", json={"arrived": False}).status_code == 200
    response = client.get(f"/api/visits/{later['id']}")
    assert response.json()["is_new_customer"] is True


def test_deleted_or_cancelled_arrivals_do_not_make_a_returning_customer(monkeypatch):
    from datetime import datetime, timezone

    from app.models.visit import VisitRecord
    from app.services import visit_service

    now = datetime.now(timezone.utc)
    records = {
        key: VisitRecord(id=key, customer_id="stage-test", visit_date="2026-09-01", created_at=now, updated_at=now, **flags)
        for key, flags in {
            "deleted": {"arrived": True, "is_deleted": True},
            "cancelled": {"arrived": True, "cancelled": True},
            "not-arrived": {"arrived": False},
        }.items()
    }
    monkeypatch.setattr(visit_service, "_visits", records)
    assert visit_service.first_arrival_dates({"stage-test"}) == {}
