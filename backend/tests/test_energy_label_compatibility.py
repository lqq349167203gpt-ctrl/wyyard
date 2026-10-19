"""项目更名只改变展示，旧权限、筛选、身份和专项扣卡类型保持兼容。"""
from copy import deepcopy

import pytest

from app.models.custom_analysis import AnalysisCondition
from app.models.energy_knot_session import EnergyKnotSessionCreate
from app.models.member_identity import IdentityCondition
from app.models.principal import PrincipalQuery
from app.services import activity_permission_service, custom_analysis_service


@pytest.mark.parametrize("field", ["activity_types", "activity_names", "payment_categories", "purchased_projects"])
@pytest.mark.parametrize("operator", ["eq", "contains", "in"])
def test_old_label_filters_match_new_category(field, operator):
    source = {"field": field, "operator": operator, "value": ["能量结"] if operator == "in" else "能量结"}
    before = deepcopy(source)
    condition = AnalysisCondition.model_validate(source)
    assert custom_analysis_service._matches({field: ["深度情绪释放"]}, condition)
    assert not custom_analysis_service._matches({field: ["情绪释放"]}, condition)
    assert source == before


def test_user_text_and_teacher_identity_are_not_renamed():
    assert AnalysisCondition(field="nickname", operator="eq", value="能量结").value == "能量结"
    teacher = IdentityCondition(type="teacher", items=["能量结老师"])
    assert teacher.items == ["能量结老师"]
    assert IdentityCondition(type="payment", payment_categories=["能量结"]).payment_categories == ["深度情绪释放"]


def test_legacy_activity_restrictions_keep_the_same_storage_key():
    old = {"体验会员": {"能量结": {"view": False, "participate": False}}}
    assert activity_permission_service._migrate(old) == old


@pytest.mark.parametrize(("old", "expected"), [("能量结", "深度情绪释放"), ("能量结·老师甲", "深度情绪释放·老师甲"), ("自定义能量结体验", "自定义能量结体验")])
def test_default_session_name_uses_new_label_without_changing_custom_content(old, expected):
    session = EnergyKnotSessionCreate(date="2026-10-19", owner_id="c", owner_name="客户", name=old, description='[{"id":"c","count":2}]')
    assert session.name == expected
    assert session.description == '[{"id":"c","count":2}]'


def test_old_statistics_picks_follow_new_activity_label_only():
    query = PrincipalQuery(breakdown=["type:能量结", "course:能量结｜组织甲", "traffic:能量结"], detail_picks=["participation_type:能量结"])
    assert query.breakdown == ["type:深度情绪释放", "course:深度情绪释放｜组织甲", "traffic:能量结"]
    assert query.detail_picks == ["participation_type:深度情绪释放"]


@pytest.mark.parametrize("label", ["深度情绪释放", "能量结"])
def test_natural_language_does_not_confuse_two_emotional_products(monkeypatch, label):
    monkeypatch.setattr(custom_analysis_service.customer_tag_service, "visible_tags_by_customer", lambda *_args, **_kwargs: {})
    plan = custom_analysis_service._local_plan(f"购买过{label}且参加过{label}的客户", "test")
    values = [(item.field, item.value) for item in plan.conditions]
    assert ("activity_types", "深度情绪释放") in values
    assert ("purchased_projects", "深度情绪释放") in values
    assert ("activity_types", "情绪释放") not in values
    assert ("purchased_projects", "情绪释放") not in values
