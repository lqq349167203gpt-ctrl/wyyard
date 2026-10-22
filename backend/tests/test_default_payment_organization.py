from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.membership_card import MembershipCardCreate
from app.services import organization_service
from app.utils.default_organization import payment_organization_id
from app.utils.record_ownership import stamp_payment_creator


@pytest.fixture
def core_org(monkeypatch):
    from app.models.organization import OrganizationCreate
    org = next((o for o in organization_service.list_organizations() if o.name == "无忧茶院"), None)
    if org is None:
        org = organization_service.create_organization(OrganizationCreate(name="无忧茶院"))
    return org


def test_default_is_core_not_first_and_supports_legacy_name(monkeypatch):
    monkeypatch.setattr(organization_service, "list_organizations", lambda: [
        SimpleNamespace(id="other", name="其他组织", status="active"),
        SimpleNamespace(id="core", name="无忧茶苑", status="active"),
    ])
    assert payment_organization_id() == "core"


def test_missing_or_archived_core_fails_without_fallback(monkeypatch):
    monkeypatch.setattr(organization_service, "list_organizations", lambda: [
        SimpleNamespace(id="other", name="其他组织", status="active"),
        SimpleNamespace(id="core", name="无忧茶院", status="archived"),
    ])
    with pytest.raises(HTTPException) as error:
        payment_organization_id()
    assert error.value.status_code == 400


def test_creation_stamp_uses_core_without_changing_input(core_org):
    data = MembershipCardCreate(customer_id="customer", nickname="测试", card_type="体验会员", organization_id="other", price=0, effective_date="2026-10-22")
    request = SimpleNamespace(state=SimpleNamespace(user_id="actor", user_owner="操作人"))
    result = stamp_payment_creator(data, request)
    assert result.organization_id == core_org.id
    assert data.organization_id == "other"


def test_membership_create_defaults_core_and_edit_preserves_history(client, created_customer, core_org):
    payload = {"customer_id": created_customer["id"], "nickname": created_customer["nickname"],
               "card_type": "体验会员", "price": 0, "effective_date": "2026-10-22", "closer_name": "测试成交人", "organization_id": "other"}
    response = client.post("/api/membership-cards", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["organization_id"] == core_org.id
    from app.services import membership_card_service
    record = membership_card_service.get_card(response.json()["id"])
    record.organization_id = "historical"
    update = client.patch(f"/api/membership-cards/{record.id}", json={"notes": "仅修改备注"})
    assert update.status_code == 200, update.text
    assert update.json()["organization_id"] == "historical"


def test_online_tea_create_overrides_old_client_org(client, created_customer, core_org):
    response = client.post("/api/online-tea", json={
        "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        "deal_date": "2026-10-22", "effective_date": "2026-10-22", "organization_id": "old-org",
        "closer_name": "测试成交人", "validity_value": 7, "validity_unit": "day",
    })
    assert response.status_code == 200, response.text
    assert response.json()["organization_id"] == core_org.id


def test_coarse_default_keeps_source_course_organization(client, created_customer, core_org, monkeypatch):
    from app.services import project_deduction_service
    captured = []

    def capture(*args, **kwargs):
        captured.append(args)
        raise ValueError("测试停止于写入前")

    monkeypatch.setattr(project_deduction_service, "create_coarse_door_course_deduction", capture)
    response = client.post("/api/project-deductions/coarse-door-course", json={
        "customer_id": created_customer["id"], "record_type": "class_record", "record_id": "course",
        "course_organization_id": "course-org", "settlement_organization_id": "old-settlement",
        "closers": [{"name": "成交人"}],
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "测试停止于写入前"
    assert captured[0][3] == "course-org"
    assert captured[0][4] == core_org.id
