from datetime import datetime, timezone
from types import SimpleNamespace as Row

from app.services import usage_analytics_service as service


def at(day, hour=0):
    return datetime(2026, 9, day, hour, tzinfo=timezone.utc)


def setup(monkeypatch):
    accounts = [
        Row(id="a", owner="甲", username="a", enabled=True, created_at=at(1), roles=["员工"], role="员工"),
        Row(id="b", owner="乙", username="b", enabled=True, created_at=at(1), roles=["员工"], role="员工"),
        Row(id="c", owner="停用", username="c", enabled=False, created_at=at(1), roles=[], role="员工"),
        Row(id="d", owner="新建", username="d", enabled=True, created_at=at(20), roles=[], role="员工"),
    ]
    monkeypatch.setattr(service.account_service, "list_accounts", lambda: accounts)
    monkeypatch.setattr(service.position_permission_service, "get_permissions", lambda _: ["healing-records"])
    monkeypatch.setattr(service.usage, "_records", lambda: [])
    monkeypatch.setattr(service.usage, "_usage_sessions", lambda: [])
    monkeypatch.setattr(service.operation_log_service, "list_logs", lambda **_: [])


def test_people_scope_and_real_time_deduplication(monkeypatch):
    setup(monkeypatch)
    sessions = [Row(account_id="a", source="pc"), Row(account_id="a", source="miniprogram")]
    monkeypatch.setattr(service.usage, "_usage_sessions", lambda: sessions)
    monkeypatch.setattr(
        service.usage, "_effective_intervals", lambda *_: [(at(5), at(5, 1), "/healing-records", "客户资料")]
    )
    result = service.overview("2026-09-01", "2026-09-07")
    assert len(result["people"]) == 2
    assert result["cards"]["used"] == 1
    assert result["cards"]["unused"] == 1
    assert result["people"][0]["seconds"] == 3600
    assert result["people"][0]["estimated_seconds"] == 0
    assert result["functions"][0]["people"] == 1
    assert result["functions"][0]["days"] == 1
    assert result["functions"][0]["eligible"] == 2


def test_terminal_filters_and_estimates_do_not_become_measured_time(monkeypatch):
    setup(monkeypatch)
    monkeypatch.setattr(
        service.usage,
        "_records",
        lambda: [
            Row(account_id="a", source="miniprogram", created_at=at(5), page_name="客户详情", event_type="page_view")
        ],
    )
    result = service.overview("2026-09-01", "2026-09-07", "miniprogram", "a")
    assert result["people"][0]["seconds"] == 0
    assert result["people"][0]["estimated_seconds"] == 300
    assert result["functions"][0]["name"] == "客户资料"
    assert result["functions"][0]["visits"] == 1
    assert service.overview("2026-09-01", "2026-09-07", "pc")["cards"]["used"] == 0


def test_cross_midnight_counts_two_active_days(monkeypatch):
    setup(monkeypatch)
    monkeypatch.setattr(service.usage, "_usage_sessions", lambda: [Row(account_id="a", source="pc")])
    monkeypatch.setattr(
        service.usage, "_effective_intervals", lambda *_: [(at(5, 15), at(5, 17), "/healing-records", "客户资料")]
    )
    result = service.overview("2026-09-05", "2026-09-06")
    assert result["people"][0]["days"] == 2
    assert result["people"][0]["seconds"] == 7200


def test_overview_endpoint_rejects_reversed_range(client):
    response = client.get("/api/login-records/overview?date_from=2026-09-10&date_to=2026-09-01")
    assert response.status_code == 400


def test_page_detail_uses_exact_canonical_page_not_content(client, monkeypatch):
    monkeypatch.setattr(service.usage, "list_activity", lambda **_: [
        {"id": "a", "page_name": "客户详情", "content": "访问页面"},
        {"id": "b", "page_name": "自定义筛选", "content": "查询客户资料"},
    ])
    response = client.get("/api/login-records?page_name=客户资料")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == ["a"]
