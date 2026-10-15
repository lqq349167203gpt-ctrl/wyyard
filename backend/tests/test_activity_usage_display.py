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


@pytest.mark.parametrize("kind,service_name,label", [
    ("gcs", "group_case_session_service", "觉醒游戏"),
    ("ers", "emotional_release_session_service", "情绪释放"),
    ("eks", "energy_knot_session_service", "能量结"),
    ("ics", "internal_course_session_service", "内部课程"),
])
@pytest.mark.parametrize("custom_name", ["实际填写的课程名称", ""])
def test_activity_name_matches_course_records(monkeypatch, kind, service_name, label, custom_name):
    record = SimpleNamespace(
        id="record", date="2026-09-10", teacher_ids=[], participant_ids=["customer"],
        withdrawn_participant_ids=[], owner_id="owner", owner_name="不应作为活动名称的案主",
        host_id="", host_name="", achiever_id="", name=custom_name,
        course_name=custom_name if kind == "ics" else "", course_type="",
        description='[{"name":"不应作为活动名称的部位"}]',
    )
    monkeypatch.setattr(customer_detail.class_record_service, "list_records", lambda: [])
    for name in ("group_case_session_service", "emotional_release_session_service",
                 "energy_knot_session_service", "internal_course_session_service"):
        monkeypatch.setattr(getattr(customer_detail, name), "list_sessions", lambda: [])
    monkeypatch.setattr(getattr(customer_detail, service_name), "list_sessions", lambda: [record])
    monkeypatch.setattr(customer_detail.membership_card_service, "list_activity_usage_records", lambda _: [])
    monkeypatch.setattr(customer_detail.membership_card_service, "list_debt_activity_usage_records", lambda _: [])
    row = customer_detail._build_activities("customer", {record.date})[0]
    assert row["name"] == (custom_name or label)
    exported = customer_detail.customer_activity_export_service.activity_rows([row], [], {}, {})
    assert exported[0][1] == row["name"]
