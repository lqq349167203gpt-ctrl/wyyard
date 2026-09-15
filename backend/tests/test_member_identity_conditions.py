"""会员身份条件：邀约情况按邀约/取消记录判断，与到店无关"""
from types import SimpleNamespace

import pytest

from app.models.member_identity import IdentityCondition


def _check(condition: IdentityCondition, *, arrival_count: int = 0, invite_count: int = 0, cancel_count: int = 0) -> bool:
    from app.services import member_identity_service as service

    return service._check_condition(
        condition, "c1", arrival_count, 0, [], [], [], [], [], [], [], "2026-01-01",
        invite_count=invite_count, cancel_count=cancel_count,
    )


def test_invitation_condition_counts_normal_invites():
    condition = IdentityCondition(type="invitation", count_op=">=", count_value=2)
    assert _check(condition, invite_count=2) is True
    assert _check(condition, invite_count=1) is False


def test_invitation_condition_can_count_cancelled():
    condition = IdentityCondition(type="invitation", count_op=">", count_value=0, invitation_scope="cancelled")
    assert _check(condition, invite_count=0, cancel_count=1) is True
    assert _check(condition, invite_count=5, cancel_count=0) is False


def test_invitation_condition_ignores_arrivals():
    """只看有没有被邀约/取消，到店次数不影响判断。"""
    condition = IdentityCondition(type="invitation", count_op=">", count_value=0)
    assert _check(condition, arrival_count=99, invite_count=0, cancel_count=0) is False
    assert _check(condition, arrival_count=0, invite_count=1, cancel_count=0) is True


@pytest.mark.parametrize("category", ["粗门次卡", "茶位费", "线下课程"])
def test_new_payment_categories_count_records(category):
    from app.services import member_identity_service as service

    condition = IdentityCondition(type="payment", payment_categories=[category], count_op=">=", count_value=2)
    args = (condition, "c1", 0, 0, [], [], [], [], [], [], [], "2026-09-15")
    assert service._check_condition(*args, extra_payment_counts={category: 2})
    assert not service._check_condition(*args, extra_payment_counts={category: 1})


def test_new_payment_counts_exclude_cancelled_and_deleted(monkeypatch):
    from app.services import member_identity_service as service
    from app.services import project_deduction_service

    condition = IdentityCondition(type="payment", payment_categories=["粗门次卡"])
    # 更新接口保存的条件可能是 dict，读取时也必须兼容。
    identities = [SimpleNamespace(conditions=[condition.model_dump()])]
    def row(**kwargs):
        return SimpleNamespace(customer_id="c1", project_name="粗门次卡", **kwargs)
    monkeypatch.setattr(project_deduction_service, "list_deductions", lambda: [row(count=5), row(cancelled=True), row(is_deleted=True)])
    assert service._extra_payment_counts(identities) == {"c1": {"粗门次卡": 1}}


def test_oh_card_old_and_new_labels_match_identically():
    from app.services import member_identity_service as service

    for category in ["OH卡诊断", "OH卡梳理"]:
        condition = IdentityCondition(type="payment", payment_categories=[category], count_value=0)
        assert service._check_condition(condition, "c1", 0, 0, [], [], [], [], [], [SimpleNamespace(purchase_count=1)], [], "2026-09-15")


def test_new_conditions_single_and_batch_refresh_agree(monkeypatch, created_customer):
    from app.services import customer_service, tea_seat_fee_service
    from app.services import member_identity_service as service

    customer = customer_service.get_customer(created_customer["id"])
    identity = SimpleNamespace(name="茶位客户", operator="all", conditions=[IdentityCondition(type="payment", payment_categories=["茶位费"], count_value=0)])
    monkeypatch.setattr(service, "list_identities", lambda: [identity])
    monkeypatch.setattr(customer_service, "list_customers", lambda: [customer])
    monkeypatch.setattr(tea_seat_fee_service, "list_fees", lambda: [SimpleNamespace(customer_id=customer.id, amount=0)])
    results = []
    monkeypatch.setattr(service, "_apply_member_type", lambda customer, name, identity: results.append(name))
    service.refresh_member_type(customer.id)
    service.refresh_all()
    assert results == ["茶位客户", "茶位客户"]
