"""客户质量筛选与批量档案修改。"""

import uuid

import pytest
from app.middleware.jwt_auth import _get_read_only_area
from app.models.customer import CustomerCreate, CustomerUpdate
from app.services import customer_access_service, customer_service, operation_log_service
from app.services.storage import load_item
from fastapi import HTTPException


def test_quality_defaults_and_option_validation():
    assert CustomerCreate(nickname="旧客户").customer_quality == "正常"
    assert CustomerUpdate(customer_quality=None).customer_quality == "正常"
    with pytest.raises(ValueError):
        CustomerUpdate(customer_quality="其他")
    assert _get_read_only_area("/api/customers/bulk-update", "PATCH") == "customers"


def test_quality_filter_happens_before_pagination(client, created_customer):
    customer_id = created_customer["id"]
    nickname = created_customer["nickname"]
    for quality, expected in (("正常", 1), ("忽视", 0)):
        response = client.get("/api/customers", params={"nickname": nickname, "customer_quality": quality, "page": 1, "page_size": 1, "list_view": True})
        assert response.status_code == 200, response.text
        assert response.json()["total"] == expected
    assert client.patch(f"/api/customers/{customer_id}", json={"customer_quality": "忽视"}).status_code == 200
    normal = client.get("/api/customers", params={"nickname": nickname, "customer_quality": "正常"}).json()
    ignored = client.get("/api/customers", params={"nickname": nickname, "customer_quality": "忽视"}).json()
    assert normal == []
    assert [item["id"] for item in ignored] == [customer_id]
    assert ignored[0]["customer_quality"] == "忽视"
    assert len(client.get("/api/customers", params={"nickname": nickname}).json()) == 1


def test_bulk_update_and_logs_persist_each_customer(client, created_customer):
    response = client.post("/api/customers", json={"nickname": f"批量老师_{uuid.uuid4().hex[:8]}"})
    assert response.status_code == 200, response.text
    teacher = response.json()
    customer_id = created_customer["id"]
    try:
        response = client.patch("/api/customers/bulk-update", json={
            "ids": [customer_id, teacher["id"], customer_id], "customer_quality": "忽视", "service_teacher": teacher["nickname"],
        })
        assert response.status_code == 200, response.text
        assert response.json()["updated_count"] == 2
        for selected in (created_customer, teacher):
            stored = load_item(customer_service.FILENAME, selected["id"])
            assert stored["customer_quality"] == "忽视"
            assert stored["service_teacher"] == teacher["nickname"]
            assert stored["nickname"] == selected["nickname"]
        logs = operation_log_service.list_logs(section="客户资料")
        log = next(item for item in logs if "批量修改2位客户" in item.content and teacher["nickname"] in item.content)
        assert created_customer["nickname"] in log.content
        assert "客户质量(正常→忽视)" in log.content and "服务老师" in log.content
        response = client.patch("/api/customers/bulk-update", json={"ids": [customer_id], "service_teacher": ""})
        assert response.status_code == 200
        assert customer_service.get_customer(customer_id).service_teacher == ""
        assert customer_service.get_customer(customer_id).customer_quality == "忽视"
    finally:
        client.delete(f"/api/customers/{teacher['id']}")


def test_bulk_failure_does_not_partially_modify(client, created_customer, monkeypatch):
    customer_id = created_customer["id"]
    original = customer_access_service.require_customer_scope

    def require_scope(request, target_id, **kwargs):
        if target_id == "not-visible":
            raise HTTPException(403, "没有修改该客户资料的权限")
        return original(request, target_id, **kwargs)

    monkeypatch.setattr(customer_access_service, "require_customer_scope", require_scope)
    response = client.patch("/api/customers/bulk-update", json={"ids": [customer_id, "not-visible"], "customer_quality": "忽视"})
    assert response.status_code == 403
    assert customer_service.get_customer(customer_id).customer_quality == "正常"
    assert load_item(customer_service.FILENAME, customer_id)["customer_quality"] == "正常"


def test_bulk_storage_failure_keeps_memory_unchanged(created_customer, monkeypatch):
    customer_id = created_customer["id"]

    def fail_commit(_writes):
        raise RuntimeError("模拟事务失败")

    monkeypatch.setattr(customer_service, "commit_pending_writes", fail_commit)
    with pytest.raises(RuntimeError):
        customer_service.bulk_update_profiles([customer_id], {"customer_quality": "忽视"})
    assert customer_service.get_customer(customer_id).customer_quality == "正常"


@pytest.mark.parametrize("changes", [{}, {"service_teacher": "不存在的老师"}, {"customer_quality": "无效"}, {"nickname": "禁止批量修改"}])
def test_bulk_rejects_invalid_changes(client, created_customer, changes):
    response = client.patch("/api/customers/bulk-update", json={"ids": [created_customer["id"]], **changes})
    assert response.status_code == 422
