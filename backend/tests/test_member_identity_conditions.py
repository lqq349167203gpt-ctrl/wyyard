"""会员身份条件：邀约情况按邀约/取消记录判断，与到店无关"""
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
