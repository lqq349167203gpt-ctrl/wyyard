"""付费子类型在筛选、统计和退费入口之间的兼容与展示回归。"""

from copy import deepcopy
from types import SimpleNamespace

import pytest
from app.api import statistics
from app.models.custom_analysis import AnalysisCondition, AnalysisPlan
from app.services import custom_analysis_service, oh_card_reading_service, project_refund_service


@pytest.mark.parametrize("operator", ["eq", "contains", "in"])
def test_old_course_template_label_matches_current_purchase_without_mutating_source(operator):
    old_label = "内部课程·疗愈师课程：自爱力构建"
    source = {
        "conditions": [{
            "field": "purchased_projects", "operator": operator,
            "value": [old_label] if operator == "in" else old_label,
        }],
    }
    saved = deepcopy(source)

    condition = AnalysisPlan.model_validate(source).conditions[0]

    assert custom_analysis_service._matches(
        {"purchased_projects": ["沙龙技能学习·疗愈师课程：自爱力构建"]}, condition,
    )
    assert source == saved


@pytest.mark.parametrize("old_type", ["月卡", "12次卡", "3月卡", "半年卡", "年卡", "常规通卡", "自定义旧卡"])
def test_old_exact_card_template_uses_current_customized_category(old_type):
    condition = AnalysisCondition(field="purchased_projects", operator="eq", value=f"会员卡·{old_type}")

    assert condition.value == "会员卡·定制化"
    assert custom_analysis_service._matches({"purchased_projects": ["会员卡·定制化"]}, condition)
    assert not custom_analysis_service._matches({"purchased_projects": ["会员卡·60次卡"]}, condition)


def test_template_multiselect_aliases_are_normalized_after_splitting():
    condition = AnalysisCondition(
        field="purchased_projects", operator="in", value="内部课程·禅茶静心训练,会员卡·年卡,会员卡·30次卡",
    )
    assert condition.value == ["沙龙技能学习·禅茶静心训练", "会员卡·定制化", "会员卡·30次卡"]


@pytest.mark.parametrize(("field", "old_value", "expected"), [
    ("payment_categories", "OH卡梳理", "OH卡诊断"),
    ("purchased_projects", "OH卡梳理", "OH卡诊断"),
    ("purchased_projects", "OH卡梳理·余老师情感类", "OH卡诊断·余老师情感类"),
    ("activity_types", "OH卡梳理", "OH卡梳理"),
    ("activity_types", "OH卡梳理·情感", "OH卡梳理·情感"),
    ("nickname", "OH卡梳理", "OH卡梳理"),
])
def test_oh_payment_alias_does_not_rename_activity_type(field, old_value, expected):
    condition = AnalysisCondition(field=field, operator="eq", value=old_value)
    assert condition.value == expected
    assert custom_analysis_service._matches({field: [expected]}, condition)


@pytest.mark.parametrize(("field", "operator", "value"), [
    ("nickname", "eq", "内部课程"),
    ("payment_projects", "eq", "年卡"),
    ("purchased_projects", "contains", "会员卡·月"),
    ("purchased_projects", "contains", "会员卡·年卡"),
    ("purchased_projects", "eq", "其他项目·年卡"),
    ("purchased_projects", "eq", "会员卡·"),
])
def test_template_compatibility_keeps_unrelated_values_and_partial_searches(field, operator, value):
    assert AnalysisCondition(field=field, operator=operator, value=value).value == value


def test_payment_analysis_keeps_offline_subtype_and_legacy_blank_fallback(monkeypatch):
    records = [
        SimpleNamespace(customer_id="c1", course_type="主理人训练", amount=0, deal_date="2026-10-01"),
        SimpleNamespace(customer_id="c2", course_type="", amount=0, deal_date="2026-10-02"),
    ]
    monkeypatch.setattr(custom_analysis_service, "payment_loader", lambda source: lambda: records if source == "offline-courses" else [])

    events = custom_analysis_service._payment_events()

    assert [(event["category"], event["product"]) for event in events] == [
        ("落地课程", "主理人训练"), ("落地课程", "落地课程"),
    ]
    monkeypatch.setattr(project_refund_service, "list_refunds", lambda: [])
    _, projects = custom_analysis_service._payment_summary(events)
    assert projects == {"c1": {"落地课程·主理人训练"}, "c2": {"落地课程"}}


def test_oh_payment_events_and_metadata_use_diagnosis_category(monkeypatch):
    records = [
        SimpleNamespace(customer_id="c1", reading_type="余老师商业梳理", amount=0, deal_date="2026-10-01"),
        SimpleNamespace(customer_id="c2", reading_type="", amount=0, deal_date="2026-10-02"),
    ]
    monkeypatch.setattr(custom_analysis_service, "payment_loader", lambda source: lambda: records if source == "oh-card-readings" else [])
    monkeypatch.setattr(project_refund_service, "list_refunds", lambda: [])

    events = custom_analysis_service._payment_events()
    _, projects = custom_analysis_service._payment_summary(events)

    assert [(event["category"], event["product"]) for event in events] == [
        ("OH卡诊断", "余老师商业梳理"), ("OH卡诊断", "OH卡诊断"),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args, **_kwargs: [
        {"payment_categories": [event["category"]], "purchased_projects": list(projects[event["customer_id"]])}
        for event in events
    ])
    fields = {field["value"]: field for field in custom_analysis_service.metadata()["fields"]}
    assert fields["payment_categories"]["options"] == ["OH卡诊断"]
    assert fields["purchased_projects"]["options"] == ["OH卡诊断", "OH卡诊断·余老师商业梳理"]
    assert AnalysisCondition(field="payment_categories", operator="in", value=["OH卡梳理"]).value == ["OH卡诊断"]


@pytest.mark.parametrize("detail_type", ["count", "persons"])
def test_oh_subtype_is_visible_in_product_order_and_customer_details(monkeypatch, detail_type):
    customer = SimpleNamespace(id="c1", nickname="客户甲", member_type="普通会员", referrer="")
    record = SimpleNamespace(
        customer_id="c1", deal_date="2026-10-01", voided=False,
        reading_type="余老师商业梳理", amount=0,
    )
    monkeypatch.setattr(statistics.customer_service, "list_all_customers", lambda: [customer])
    monkeypatch.setattr(statistics.customer_service, "get_customer", lambda _id: customer)
    monkeypatch.setattr(statistics, "_build_activities", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(statistics.visit_note_service, "list_visible_notes", lambda *_args, **_kwargs: [])
    for service, method in (
        (statistics.membership_card_service, "list_cards"),
        (statistics.group_case_service, "list_cases"),
        (statistics.emotional_release_service, "list_releases"),
        (statistics.energy_knot_service, "list_knots"),
        (statistics.internal_course_service, "list_courses"),
        (statistics.offline_course_service, "list_courses"),
        (statistics.other_project_service, "list_projects"),
    ):
        monkeypatch.setattr(service, method, lambda: [])
    monkeypatch.setattr(statistics.oh_card_reading_service, "list_readings", lambda: [record])

    result = statistics.get_product_details(
        date="2026-10-01", type=detail_type, product_type="OH卡诊断", referrer=None, teacher_id=None,
    )["data"]

    assert len(result) == 1
    if detail_type == "persons":
        assert result[0]["products"] == ["OH卡诊断：余老师商业梳理"]
    else:
        assert result[0]["name"] == "余老师商业梳理"


def test_oh_refund_options_distinguish_subtypes_and_keep_legacy_label(monkeypatch):
    records = [
        SimpleNamespace(id="reading-1", customer_id="c1", is_deleted=False, reading_type="OH卡情感梳理", purchase_count=1, amount=0),
        SimpleNamespace(id="reading-2", customer_id="c1", is_deleted=False, reading_type="余老师情感类", purchase_count=1, amount=0),
        SimpleNamespace(id="reading-3", customer_id="c1", is_deleted=False, reading_type="", purchase_count=1, amount=0),
        SimpleNamespace(id="reading-4", customer_id="c2", is_deleted=False, reading_type="余老师商业梳理", purchase_count=1, amount=0),
    ]
    monkeypatch.setattr(oh_card_reading_service, "list_readings", lambda: records)
    monkeypatch.setattr(project_refund_service, "is_project_refunded", lambda _type, _id: _id == "reading-2")

    options = project_refund_service.get_available_items("c1", "oh-card-readings")

    assert [(item["id"], item["name"]) for item in options] == [
        ("reading-1", "OH卡情感梳理（1次）"), ("reading-3", "OH卡诊断（1次）"),
    ]
