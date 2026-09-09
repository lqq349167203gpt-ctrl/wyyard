"""活动展示必须按实际流水，不能把配置次数当作实际会员卡扣卡。"""

from types import SimpleNamespace

import pytest

from app.api import customer_detail


@pytest.mark.parametrize("usage,debt,expected,count", [
    ([], [], "已参与", 0),
    ([{"benefit_type": "internal_course"}], [], "内部课程权益使用1次", 0),
    ([], [{"benefit_type": "membership_debt"}], "预支扣卡1次", 0),
    ([{"benefit_type": "count_card"}], [{"benefit_type": "membership_debt"}], "会员卡扣卡1次、预支扣卡1次", 1),
    ([{"benefit_name": "粗门次卡"}], [], "粗门扣卡1次", 0),
])
def test_activity_summary_uses_actual_usage(monkeypatch, usage, debt, expected, count):
    record = SimpleNamespace(
        id="record", date="2026-09-10", teacher_ids=[], participant_ids=["customer"],
        withdrawn_participant_ids=[], membership_deduction_count=2, groups=[],
        activity_name="课程", course_name="课程", course_type="沙龙", is_public_welfare=False,
    )
    monkeypatch.setattr(customer_detail.class_record_service, "list_records", lambda: [record])
    for service in (customer_detail.group_case_session_service, customer_detail.emotional_release_session_service,
                    customer_detail.energy_knot_session_service, customer_detail.internal_course_session_service):
        monkeypatch.setattr(service, "list_sessions", lambda: [])
    monkeypatch.setattr(customer_detail.membership_card_service, "list_activity_usage_records",
                        lambda _: [dict(item, key="class:record") for item in usage])
    monkeypatch.setattr(customer_detail.membership_card_service, "list_debt_activity_usage_records",
                        lambda _: [dict(item, key="class:record#unit=2") for item in debt])
    row = customer_detail._build_activities("customer", {record.date})[0]
    assert row["deduction_summary"] == expected
    assert row["membership_deduction_count"] == count
