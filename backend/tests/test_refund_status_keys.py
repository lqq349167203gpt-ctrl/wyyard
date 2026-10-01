"""付费列表的退费标识：不受历史条数限制，仍遵守交易/客户权限。"""

from types import SimpleNamespace

from fastapi import HTTPException

from app.api import project_refunds


def test_status_keys_include_old_records_and_only_requested_projects(client, monkeypatch):
    records = [
        SimpleNamespace(customer_id="visible", project_type="group-cases", project_id=f"project-{i}")
        for i in range(130)
    ]
    records.append(records[-1])
    monkeypatch.setattr(project_refunds.project_refund_service, "list_refunds", lambda: records)
    monkeypatch.setattr(project_refunds.customer_access_service, "filter_record_dicts", lambda request, items: items)
    response = client.get("/api/project-refunds/status-keys", params={"project_ids": ["project-129", "not-refunded"]})
    assert response.status_code == 200
    assert response.json() == ["group-cases:project-129"]


def test_status_keys_filter_invisible_customers(client, monkeypatch):
    monkeypatch.setattr(project_refunds.project_refund_service, "list_refunds", lambda: [
        SimpleNamespace(customer_id="hidden", project_type="group-cases", project_id="hidden-project"),
        SimpleNamespace(customer_id="visible", project_type="group-cases", project_id="visible-project"),
    ])
    monkeypatch.setattr(project_refunds.customer_access_service, "filter_record_dicts",
                        lambda request, items: [item for item in items if item["customer_id"] == "visible"])
    response = client.get("/api/project-refunds/status-keys", params={"project_ids": ["hidden-project", "visible-project"]})
    assert response.json() == ["group-cases:visible-project"]


def test_status_keys_require_transaction_detail_access(client, monkeypatch):
    def denied(request, *, detail):
        assert detail is True
        raise HTTPException(status_code=403, detail="无交易记录查看权限")

    monkeypatch.setattr(project_refunds.customer_access_service, "require_transaction_access", denied)
    response = client.get("/api/project-refunds/status-keys", params={"project_ids": ["a"]})
    assert response.status_code == 403


def test_status_keys_reject_unbounded_requests(client):
    assert client.get("/api/project-refunds/status-keys").status_code == 422
    response = client.get("/api/project-refunds/status-keys", params={"project_ids": [str(i) for i in range(101)]})
    assert response.status_code == 422
