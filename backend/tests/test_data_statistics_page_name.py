"""数据统计改名兼容旧日志和使用记录，不迁移或覆盖历史内容。"""

from datetime import datetime, timezone

from app.models.login_record import LoginRecord
from app.models.operation_log import OperationLog
from app.services import account_service, login_record_service, operation_log_service, usage_analytics_service
from app.utils.page_labels import DATA_STATISTICS_ALIASES


def history(monkeypatch):
    now = datetime.now(timezone.utc)
    logs = {str(index): OperationLog(id=str(index), created_at=now, section=section,
                                    path="/api/principal/query", method="POST", content="执行转化分析")
            for index, section in enumerate(sorted(DATA_STATISTICS_ALIASES))}
    logs["other"] = OperationLog(id="other", created_at=now, section="组织信息", content="修改组织配置")
    monkeypatch.setattr(operation_log_service, "_logs", logs)
    return logs


def test_new_and_old_log_filters_return_same_history_without_changing_storage(client, monkeypatch):
    logs = history(monkeypatch)
    before = {key: item.model_dump() for key, item in logs.items()}
    for name in DATA_STATISTICS_ALIASES:
        response = client.get("/api/operation-logs", params={"section": name, "page": 1})
        assert response.status_code == 200, response.text
        assert {item["id"] for item in response.json()["items"]} == set(logs) - {"other"}
    converted = client.get("/api/analysis-logs", params={"kind": "conversion"})
    assert converted.status_code == 200, converted.text
    assert {item["id"] for item in converted.json()["items"]} == set(logs) - {"other"}
    assert {key: item.model_dump() for key, item in logs.items()} == before


def test_usage_names_share_one_permission_key_and_keep_both_routes():
    for name in DATA_STATISTICS_ALIASES:
        assert usage_analytics_service.canonical_page(name) == "数据统计"
    assert usage_analytics_service.PAGE_KEYS["数据统计"] == "principal"
    assert login_record_service._page_name("/principal") == "数据统计"
    assert login_record_service._page_name("/pages/principal/index") == "数据统计"
    assert usage_analytics_service.canonical_page("组织信息") == "组织信息"


def test_old_usage_details_can_be_found_with_new_name_without_rewriting_records(client, monkeypatch):
    account = account_service.get_by_username("pytest_admin")
    now = datetime.now(timezone.utc)
    records = [LoginRecord(id=str(index), account_id=account.id, username=account.username, owner=account.owner,
                           role=account.role, source="pc", event_type="page_view", page_name=name,
                           page_path="/principal", created_at=now)
               for index, name in enumerate(sorted(DATA_STATISTICS_ALIASES))]
    monkeypatch.setattr(login_record_service, "_records", lambda: records)
    monkeypatch.setattr(login_record_service, "_usage_sessions", lambda: [])
    for name in DATA_STATISTICS_ALIASES:
        response = client.get("/api/login-records", params={"event_type": "page_view", "keyword": "数据统计", "page_name": name})
        assert response.status_code == 200, response.text
        assert response.json()["total"] == len(records)
        assert all(item["page_name"] == "数据统计" for item in response.json()["items"])
    assert {record.page_name for record in records} == DATA_STATISTICS_ALIASES
