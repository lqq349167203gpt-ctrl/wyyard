import uuid

import pytest


def test_deduction_ownership_limit_and_actor(client, created_customer):
    customer = created_customer
    card = client.post("/api/membership-cards", json={
        "customer_id": customer["id"], "nickname": customer["nickname"],
        "card_type": "次卡", "price": 500, "effective_date": "2026-01-01",
        "duration_type": "month", "duration_value": 120, "total_count": 5, "remaining_count": 5,
    }).json()
    payload = {"customer_id": customer["id"], "project_type": "membership-cards",
               "project_id": card["id"], "count": 1, "reason": "核对", "created_by": "伪造人"}
    result = client.post("/api/project-deductions", json=payload)
    assert result.status_code == 200, result.text
    record = result.json()
    assert record["created_by"] == "不闹"
    assert client.patch(f"/api/project-deductions/{record['id']}", json={"count": 6}).status_code == 400
    assert client.patch(f"/api/project-deductions/{record['id']}", json={"count": 5}).status_code == 200
    other = client.post("/api/customers", json={"nickname": f"另一客户_{uuid.uuid4().hex[:8]}"}).json()
    assert client.post("/api/project-deductions", json={**payload, "customer_id": other["id"]}).status_code == 400


def test_refund_rejects_unknown_type_and_restores_project_rights(client, created_customer):
    customer = created_customer
    invalid = client.post("/api/project-refunds", json={
        "customer_id": customer["id"], "project_type": "unknown", "project_id": "unknown", "refund_amount": 100,
    })
    assert invalid.status_code == 400
    purchase_response = client.post("/api/group-cases", json={
        "customer_id": customer["id"], "nickname": customer["nickname"],
        "purchase_count": 3, "amount": 300, "effective_date": "2026-01-01", "expiry_date": "2036-01-01",
    })
    assert purchase_response.status_code == 200, purchase_response.text
    purchase = purchase_response.json()
    refund = client.post("/api/project-refunds", json={
        "customer_id": customer["id"], "project_type": "group-cases", "project_id": purchase["id"],
        "refund_amount": 300, "created_by": "伪造人",
    })
    assert refund.status_code == 200, refund.text
    assert refund.json()["created_by"] == "不闹"
    from app.services import group_case_session_service
    assert group_case_session_service.get_purchase_remaining(purchase["id"]) == 0
    assert client.post("/api/project-deductions", json={
        "customer_id": customer["id"], "project_type": "group-cases", "project_id": purchase["id"],
        "count": 1, "reason": "已退费不可扣",
    }).status_code == 400
    assert client.delete(f"/api/project-refunds/{refund.json()['id']}").status_code == 200
    assert group_case_session_service.get_purchase_remaining(purchase["id"]) == 3


def test_non_membership_deduction_rejects_another_customers_project(client, created_customer):
    owner = created_customer
    other = client.post("/api/customers", json={"nickname": f"另一归属_{uuid.uuid4().hex[:8]}"}).json()
    purchase = client.post("/api/group-cases", json={
        "customer_id": owner["id"], "nickname": owner["nickname"], "purchase_count": 3,
        "amount": 300, "effective_date": "2026-01-01", "expiry_date": "2036-01-01",
    }).json()
    response = client.post("/api/project-deductions", json={
        "customer_id": other["id"], "project_type": "group-cases", "project_id": purchase["id"],
        "count": 1, "reason": "跨客户不可扣",
    })
    assert response.status_code == 400
    assert "不属于" in response.json()["detail"]


def test_coarse_count_cannot_be_changed_without_course_ledger(monkeypatch):
    from datetime import datetime

    from app.models.project_deduction import ProjectDeduction
    from app.services import project_deduction_service as service

    record = ProjectDeduction(
        id="coarse-test", customer_id="customer", nickname="客户", project_type="membership-cards",
        project_id="coarse:class:activity", project_name="粗门次卡", count=2,
        deduction_date="2026-09-10", reason="课程抵扣", source_activity_key="class:activity", created_at=datetime.now(),
    )
    monkeypatch.setattr(service, "_deductions", {record.id: record})
    monkeypatch.setattr(service, "_save", lambda *_: None)
    with pytest.raises(ValueError, match="次数由课程决定"):
        service.update_deduction(record.id, 3)
    assert record.count == 2
    assert service.update_deduction(record.id, 2, reason="更新说明").reason == "更新说明"
