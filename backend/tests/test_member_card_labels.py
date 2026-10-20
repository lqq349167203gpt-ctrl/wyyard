from types import SimpleNamespace as NS

import pytest

from app.models.member_identity import IdentityCondition, MemberIdentityCreate
from app.services import member_card_label_service as labels
from app.services import member_identity_service as identities
from app.services import membership_card_service as cards
from app.services import project_deduction_service
from app.services.storage import load_data, save_data


@pytest.fixture(autouse=True)
def isolated_labels(monkeypatch):
    previous = load_data(identities.FILENAME)
    monkeypatch.setattr(identities, "_identities", {})
    monkeypatch.setattr(cards, "_cards", {})
    monkeypatch.setattr(cards, "_deductions", {})
    monkeypatch.setattr(project_deduction_service, "_deductions", {})
    monkeypatch.setattr(labels, "_today", lambda: "2026-10-20")
    monkeypatch.setattr(identities, "refresh_all", lambda: None)
    labels.invalidate()
    yield
    save_data(identities.FILENAME, previous)
    labels.invalidate()


def card(id="one", customer="c", count=4, **changes):
    return NS(**{"id": id, "customer_id": customer, "card_type": "体验会员", "total_count": count, "remaining_count": count,
                 "effective_date": "2026-10-01", "expiry_date": "2026-10-31", "voided": False, "is_deleted": False, "price": 0, **changes})


def test_remaining_uses_actual_deductions_and_sums_only_selected_active_cards(monkeypatch):
    monkeypatch.setattr(cards, "_cards", {
        "one": card(), "two": card("two", count=30, card_type="30次卡"),
        "expired": card("expired", count=90, expiry_date="2026-10-19"),
        "future": card("future", count=90, effective_date="2026-10-21"),
        "void": card("void", count=90, voided=True),
    })
    monkeypatch.setattr(cards, "_deductions", {"c": [{"card_id": "one"}, {"card_id": "two"}]})
    monkeypatch.setattr(project_deduction_service, "_deductions", {"manual": NS(project_type="membership-cards", project_id="one", is_deleted=False, count=1)})
    assert labels.matches_condition(IdentityCondition(type="remaining", remaining_min=31, remaining_max=31), "c")
    assert labels.matches_condition(IdentityCondition(type="remaining", items=["体验会员"], remaining_min=2, remaining_max=2), "c")
    assert not labels.matches_condition(IdentityCondition(type="remaining", remaining_max=0), "missing")


@pytest.mark.parametrize("state,changes", [
    ("expired", {"expiry_date": "2026-10-19"}), ("pending", {"effective_date": "2026-10-21"}),
    ("voided", {"voided": True}), ("unlimited", {"remaining_count": None, "total_count": None}),
])
def test_special_states_do_not_match_zero_balance(monkeypatch, state, changes):
    record = card()
    for key, value in changes.items():
        setattr(record, key, value)
    monkeypatch.setattr(cards, "_cards", {record.id: record})
    assert labels.matches_condition(IdentityCondition(type="remaining", remaining_state=state), "c")
    assert not labels.matches_condition(IdentityCondition(type="remaining", remaining_max=0), "c")
    assert labels.matches_condition(IdentityCondition(type="remaining", remaining_state="never"), "missing")


def test_two_groups_roundtrip_and_remaining_filters(client, created_customer, monkeypatch):
    preset = client.post("/api/member-identities/card-status/preset")
    assert preset.status_code == 200, preset.text
    assert len(preset.json()) == 8
    assert client.get("/api/member-identities").json() == []
    assert len(client.get("/api/member-identities", params={"group": "all"}).json()) == 8
    record = card(customer=created_customer["id"])
    monkeypatch.setattr(cards, "_cards", {record.id: record})
    labels.invalidate()
    response = client.get("/api/customers/light")
    customer = next(row for row in response.json() if row["id"] == created_customer["id"])
    assert customer["card_status"] == "即将用完"
    assert customer["card_status_tone"] == "warning"
    result = client.get("/api/customers", params={"card_status": "即将用完", "page": 1, "page_size": 20}).json()
    assert created_customer["id"] in {row["id"] for row in result["items"]}
    target = next(item for item in preset.json() if item["name"] == "即将用完")
    edited = client.put(f"/api/member-identities/{target['id']}", json={"name": "需要续卡", "conditions": target["conditions"]})
    assert edited.status_code == 200, edited.text
    assert labels.label_for(created_customer["id"])["card_status"] == "需要续卡"
    identities._load()
    assert len(identities.list_identities("card_status")) == 8


def test_overlap_rejected_and_secondary_rename_delete_does_not_touch_permissions(monkeypatch):
    from app.services import activity_permission_service, position_customer_permission_service

    def forbidden(*args):
        raise AssertionError("第二套标签不能修改身份权限")
    monkeypatch.setattr(position_customer_permission_service, "rename_identity_in_permissions", forbidden)
    monkeypatch.setattr(activity_permission_service, "rename_identity", forbidden)
    monkeypatch.setattr(position_customer_permission_service, "remove_identity_from_permissions", forbidden)
    monkeypatch.setattr(activity_permission_service, "remove_identity", forbidden)
    item = identities.create_identity(MemberIdentityCreate(name="低余量", group="card_status", conditions=[{"type": "remaining", "remaining_min": 1, "remaining_max": 5}]))
    with pytest.raises(ValueError, match="范围重复"):
        identities.create_identity(MemberIdentityCreate(name="重复", group="card_status", conditions=[{"type": "remaining", "remaining_min": 5, "remaining_max": 8}]))
    from app.models.member_identity import MemberIdentityUpdate
    identities.update_identity(item.id, MemberIdentityUpdate(name="将用完"))
    assert identities.delete_identity(item.id)


def test_current_label_changes_on_deduction_revision_and_expiry(monkeypatch):
    identities.create_identity(MemberIdentityCreate(name="余量正常", group="card_status", conditions=[{"type": "remaining", "remaining_min": 4}]))
    identities.create_identity(MemberIdentityCreate(name="低余量", group="card_status", conditions=[{"type": "remaining", "remaining_min": 0, "remaining_max": 3}]))
    identities.create_identity(MemberIdentityCreate(name="已过期", group="card_status", conditions=[{"type": "remaining", "remaining_state": "expired"}]))
    monkeypatch.setattr(cards, "_cards", {"one": card()})
    revision = [1]
    monkeypatch.setattr(labels, "data_revision", lambda: revision[0])
    assert labels.label_for("c")["card_status"] == "余量正常"
    monkeypatch.setattr(cards, "_deductions", {"c": [{"card_id": "one"}]})
    revision[0] += 1
    assert labels.label_for("c")["card_status"] == "低余量"
    monkeypatch.setattr(labels, "_today", lambda: "2026-11-01")
    assert labels.label_for("c")["card_status"] == "已过期"


def test_primary_identity_can_use_remaining_condition_without_secondary_permission_identity(monkeypatch):
    primary = identities.create_identity(MemberIdentityCreate(name="有效计次会员", type="老人", conditions=[{"type": "remaining", "remaining_min": 1}]))
    secondary = identities.create_identity(MemberIdentityCreate(name="卡次充足", group="card_status", conditions=[{"type": "remaining", "remaining_min": 1}]))
    monkeypatch.setattr(cards, "_cards", {"one": card()})
    assert identities._check_condition(primary.conditions[0], "c", 0, 0, [], [], [], [], [], [], [], "2026-10-20")
    assert [item.id for item in identities.list_identities()] == [primary.id]
    assert secondary.name not in [item.name for item in identities.list_identities()]
    assert labels.label_for("c")["card_status"] == "卡次充足"


def test_preset_storage_failure_does_not_leave_partial_labels(monkeypatch):
    def fail(*args, **kwargs):
        raise OSError("模拟存储失败")
    monkeypatch.setattr(identities, "save_data", fail)
    with pytest.raises(OSError):
        identities.create_card_status_batch([
            MemberIdentityCreate(name="待续费", group="card_status", conditions=[{"type": "remaining", "remaining_min": 0, "remaining_max": 0}]),
            MemberIdentityCreate(name="有余量", group="card_status", conditions=[{"type": "remaining", "remaining_min": 1}]),
        ])
    assert identities.list_identities("card_status") == []
