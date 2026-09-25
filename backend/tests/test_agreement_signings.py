from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.api import agreement_signings
from app.middleware.jwt_auth import require_page_permission
from app.models.membership_card import MembershipCard
from app.services import membership_card_service as service
from app.services import operation_log_service, position_edit_permission_service, position_permission_service
from app.services.storage import load_data


def payload(customer, **extra):
    return {
        "customer_id": customer["id"], "nickname": customer["nickname"],
        "card_type": "月卡", "price": 0, "effective_date": "2026-01-01",
        "duration_type": "month", "duration_value": 120, **extra,
    }


@pytest.mark.parametrize("card_type", ["月卡", "12次卡", "3月卡", "30次卡", "45次卡", "半年卡", "年卡"])
def test_required_on_create(client, created_customer, card_type):
    response = client.post("/api/membership-cards", json=payload(created_customer, card_type=card_type))
    assert response.status_code == 400, response.text
    assert "协议" in response.json()["detail"]


@pytest.mark.parametrize("card_type", ["次卡", "体验会员"])
def test_exempt_on_create(client, created_customer, card_type):
    response = client.post("/api/membership-cards", json=payload(created_customer, card_type=card_type))
    assert response.status_code == 200, response.text
    assert response.json()["agreement_status"] is None


def test_sign_persist_and_no_card_changes(client, created_customer):
    response = client.post("/api/membership-cards", json=payload(created_customer, agreement_status="unsigned"))
    assert response.status_code == 200, response.text
    card = response.json()
    card_id = card["id"]
    query = {"nickname": created_customer["nickname"]}
    before = client.get("/api/agreement-signings", params=query).json()
    assert [r["id"] for r in before["items"]] == [card_id]
    assert client.patch(f"/api/agreement-signings/{card_id}", json={}).status_code == 200
    saved = load_data(service.FILENAME)[card_id]
    assert saved["agreement_status"] == "signed"
    for field in ("remaining_count", "total_count", "effective_date", "expiry_date", "closers"):
        assert saved[field] == card.get(field)
    assert client.get("/api/agreement-signings", params=query).json()["total"] == 0
    assert client.get("/api/agreement-signings", params={**query, "tab": "signed"}).json()["total"] == 1
    assert client.patch(f"/api/agreement-signings/{card_id}", json={}).status_code == 200
    logs = [log for log in operation_log_service.list_logs(section="协议签订") if log.entity_id == card_id]
    assert len(logs) == 1
    assert logs[0].before_data == {"agreement_status": "unsigned"}
    assert logs[0].after_data == {"agreement_status": "signed"}
    assert client.patch(f"/api/membership-cards/{card_id}", json={"agreement_status": None}).status_code == 400
    assert client.patch(f"/api/membership-cards/{card_id}", json={"agreement_status": "invalid"}).status_code == 400


def test_date_boundaries_legacy_and_exclusions(client, created_customer, monkeypatch):
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    past, future = (today - timedelta(days=1)).isoformat(), (today + timedelta(days=1)).isoformat()
    now = datetime.now(timezone.utc)
    def card(key, **extra):
        return MembershipCard(
            id=key, created_at=now, updated_at=now,
            **payload(created_customer, **{"effective_date": today.isoformat(), "expiry_date": today.isoformat(), **extra}),
        )
    records = {
        "boundary": card("boundary"),
        "expired": card("expired", effective_date=past, expiry_date=past),
        "future": card("future", effective_date=future, expiry_date=future),
        "signed": card("signed", agreement_status="signed"),
        "exempt": card("exempt", card_type="次卡"),
        "experience": card("experience", card_type="体验会员"),
        "void": card("void", voided=True),
        "deleted": card("deleted", is_deleted=True),
    }
    monkeypatch.setattr(service, "_cards", records)
    pending = client.get("/api/agreement-signings").json()
    assert [r["id"] for r in pending["items"]] == ["boundary"]
    archive = client.get("/api/agreement-signings", params={"tab": "signed", "page_size": 100}).json()
    assert {r["id"] for r in archive["items"]} == {"expired", "future", "signed"}
    expired = next(row for row in archive["items"] if row["id"] == "expired")
    assert expired["agreement_status"] == "unsigned"
    assert expired["period"] == "已过期"


def test_page_transaction_customer_scope_and_creator_permission(client, created_customer, monkeypatch):
    response = client.post("/api/membership-cards", json=payload(created_customer, agreement_status="unsigned"))
    assert response.status_code == 200, response.text
    card_id = response.json()["id"]
    request = SimpleNamespace(state=SimpleNamespace(user_id="other", user_owner="其他员工", user_roles=["测试角色"]))
    monkeypatch.setattr(position_permission_service, "get_permissions", lambda _: [])
    with pytest.raises(HTTPException) as exc:
        require_page_permission("agreement-signings")(request)
    assert exc.value.status_code == 403
    permissions = {"payments": "own", "customer_access": {
        "scope": "all", "relations": {}, "transaction_access": "detail",
    }}
    monkeypatch.setattr(position_edit_permission_service, "get_permissions", lambda _: permissions)
    rows = agreement_signings.list_agreements(request, page=1, page_size=20)["items"]
    assert not next(row for row in rows if row["id"] == card_id)["can_sign"]
    assert not next(row for row in rows if row["id"] == card_id)["can_change_status"]
    with pytest.raises(HTTPException) as exc:
        agreement_signings.sign_agreement(card_id, request)
    assert exc.value.status_code == 403
    permissions["customer_access"]["transaction_access"] = "none"
    with pytest.raises(HTTPException):
        agreement_signings.list_agreements(request, page=1, page_size=20)
    permissions["customer_access"]["transaction_access"] = "detail"
    permissions["customer_access"]["scope"] = "none"
    assert agreement_signings.list_agreements(request, page=1, page_size=20)["total"] == 0
    with pytest.raises(HTTPException):
        agreement_signings.sign_agreement(card_id, request)


@pytest.mark.parametrize("expired", [False, True])
def test_correct_signed_status_preserves_rights_and_logs(client, created_customer, expired):
    response = client.post("/api/membership-cards", json=payload(
        created_customer, agreement_status="signed",
        effective_date="2000-01-01" if expired else "2026-01-01",
        duration_value=1 if expired else 120,
    ))
    assert response.status_code == 200, response.text
    original = response.json()
    card_id = original["id"]
    path = f"/api/agreement-signings/{card_id}"
    query = {"nickname": created_customer["nickname"], "tab": "signed"}
    row = client.get("/api/agreement-signings", params=query).json()["items"][0]
    assert row["can_change_status"] and not row["can_sign"]
    assert client.patch(path, json={"agreement_status": "unsigned"}).status_code == 200
    saved = load_data(service.FILENAME)[card_id]
    assert saved["agreement_status"] == "unsigned"
    for field in ("remaining_count", "total_count", "effective_date", "expiry_date", "closers"):
        assert saved[field] == original.get(field)
    query["tab"] = "signed" if expired else "unsigned"
    row = client.get("/api/agreement-signings", params=query).json()["items"][0]
    assert row["agreement_status"] == "unsigned" and row["can_sign"]
    assert client.patch(path, json={"agreement_status": "unsigned"}).status_code == 200
    logs = operation_log_service.list_logs(section="协议签订", entity_id=card_id)
    assert len(logs) == 1
    assert logs[0].before_data == {"agreement_status": "signed"}
    assert logs[0].after_data == {"agreement_status": "unsigned"}
    assert client.patch(path, json={"agreement_status": "signed"}).status_code == 200
    assert load_data(service.FILENAME)[card_id]["agreement_status"] == "signed"
    assert client.patch(path, json={"agreement_status": "invalid"}).status_code == 422
    assert client.patch(path, json={"agreement_status": None}).status_code == 422


def test_correction_cannot_bypass_creator_permission(client, created_customer, monkeypatch):
    response = client.post("/api/membership-cards", json=payload(created_customer, agreement_status="signed"))
    card_id = response.json()["id"]
    request = SimpleNamespace(state=SimpleNamespace(user_id="other", user_owner="其他员工", user_roles=["测试角色"]))
    monkeypatch.setattr(position_edit_permission_service, "get_permissions", lambda _: {
        "payments": "own", "customer_access": {"scope": "all", "relations": {}, "transaction_access": "detail"},
    })
    with pytest.raises(HTTPException) as exc:
        agreement_signings.sign_agreement(card_id, request, agreement_signings.AgreementStatusUpdate(agreement_status="unsigned"))
    assert exc.value.status_code == 403
    assert service.get_card(card_id).agreement_status == "signed"
