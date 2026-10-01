"""取消邀约只清理对应日的分组，不依赖前端局部名单。"""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.models.daily_grouping import DailyGrouping, GroupInfo
from app.services import daily_grouping_service as grouping_service
from app.services import visit_service


def test_cancel_removes_only_target_customer(monkeypatch):
    now = datetime.now(timezone.utc)
    grouping = DailyGrouping(id="test-group", date="2026-09-01", created_at=now, updated_at=now,
                             groups=[GroupInfo(leader_id="cancelled", member_ids=["other"])])
    monkeypatch.setattr(grouping_service, "_groupings", {grouping.id: grouping})
    monkeypatch.setattr(visit_service, "_visits", {})
    saved = []
    monkeypatch.setattr(grouping_service, "_save", saved.append)
    grouping_service.remove_cancelled_customer("2026-09-02", "cancelled")
    assert saved == []
    grouping_service.remove_cancelled_customer("2026-09-01", "cancelled")
    assert grouping.groups[0].leader_id == ""
    assert grouping.groups[0].member_ids == ["other"]
    assert saved == [grouping.id]


def test_another_active_visit_preserves_group(monkeypatch):
    monkeypatch.setattr(visit_service, "_visits", {"another-space": SimpleNamespace(
        customer_id="customer", visit_date="2026-09-01", is_deleted=False, cancelled=False,
    )})
    monkeypatch.setattr(grouping_service, "get_grouping", lambda _: (_ for _ in ()).throw(
        AssertionError("同日仍有有效邀约，不应清理分组")))
    grouping_service.remove_cancelled_customer("2026-09-01", "customer")


def test_cancel_api_triggers_group_cleanup(client, created_customer, monkeypatch):
    response = client.post("/api/visits", json={
        "visit_date": "2026-09-01", "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
    })
    assert response.status_code == 200
    calls = []
    monkeypatch.setattr(grouping_service, "remove_cancelled_customer", lambda *args: calls.append(args))
    response = client.patch(f"/api/visits/{response.json()['id']}", json={"cancelled": True})
    assert response.status_code == 200
    assert calls == [("2026-09-01", created_customer["id"])]
