"""购买阶段防错、有效订单及查看权限不改变分类的回归。"""
from copy import deepcopy
from datetime import date
from types import SimpleNamespace as NS

import pytest

from app.models.principal import PrincipalQuery
from app.models.upsell_config import PURCHASE_RULE_LABELS, PurchaseRule, UpsellConfigUpdate
from app.services import course_workflow_service as workflow
from app.services import principal_service as principal
from app.services import upsell_config_service as rules
from app.services.storage import load_data, save_data


@pytest.fixture(autouse=True)
def isolated_config(monkeypatch):
    original = load_data(rules.UPSELL_FILE)
    monkeypatch.setattr(rules, '_rules', [PurchaseRule(**r) for r in rules.recommended_rules()])
    yield
    save_data(rules.UPSELL_FILE, original)


def event(i):
    return {'id': f'energy:{i}', 'customer_id': 'test_customer', 'date': f'2026-01-0{i}',
            'kind': 'purchase', 'product': 'energy', 'subtype': ''}


def config(**conditions):
    return [{'key': k, 'conditions': conditions.get(k, [])} for k in PURCHASE_RULE_LABELS]


@pytest.fixture
def two_orders(monkeypatch):
    from app.api import statistics
    from app.services import course_service, course_type_service, project_refund_service
    org = NS(id='audit_org', name='无忧茶院', member_ids=[])
    permissions = {'customer_access': {'transaction_access': 'detail'}}
    monkeypatch.setattr(principal, 'scope', lambda _: ([org], {'test_customer': NS(nickname='测试客户', name='')}, permissions))
    monkeypatch.setattr(principal.organization_service, 'list_organizations', lambda: [org])
    monkeypatch.setattr(course_service, 'list_courses', lambda: [])
    monkeypatch.setattr(course_type_service, 'list_course_types', lambda: [])
    monkeypatch.setattr(statistics, 'COURSE_ACTIVITY_TYPES', [])
    monkeypatch.setattr(principal.project_deduction_service, 'list_deductions', lambda **kw: [])
    monkeypatch.setattr(project_refund_service, '_refunds', {})
    records = []
    for i in [1, 2]:
        data = dict(id=str(i), customer_id='test_customer', organization_id='audit_org', is_deleted=False,
                    voided=False, deal_date=f'2026-01-0{i}', created_at=f'2026-01-0{i}T12:00:00Z')
        records.append(NS(**data, model_dump=lambda mode=None, row=data: dict(row)))
    monkeypatch.setattr(principal, 'PRODUCTS', [('group_case', '觉醒游戏', lambda: records, '')])
    return records


def test_refund_is_excluded_in_report_and_workflow(monkeypatch, two_orders):
    from app.services import project_refund_service
    monkeypatch.setattr(project_refund_service, '_refunds', {'refund': NS(project_type='group-cases', project_id='1', is_deleted=False)})
    report_events = principal.collect_data(NS())[2]
    task_events = workflow.active_events(workflow.all_orders(), '2026-01-03')
    rules.classify_visible_events(report_events, until='2026-01-03')
    rules.classify_purchases(task_events)
    assert len(report_events) == len(task_events) == 1
    assert report_events[0]['classification'] == task_events[0]['classification'] == '转化'
    result = principal.analyze(NS(state=NS(user_id='refund_audit', user_role='超级管理员')),
                               PrincipalQuery(tab='orders', organization_id='audit_org', date_from=date(2026, 1, 1), date_to=date(2026, 1, 31)))
    assert result['total'] == 1
    assert result['items'][0]['classification'] == '转化'


def test_own_only_view_uses_full_history_without_exposing_hidden_orders(monkeypatch, two_orders):
    from app.services import customer_access_service, sales_access_service
    two_orders[0].created_by_id = 'another_account'
    two_orders[1].created_by_id = 'current_account'
    request = NS(state=NS(user_id='current_account', user_role='audit_sales', user_roles=['audit_sales']))
    p = {'customer_access': {'transaction_access': 'detail'}, 'payment_rules': {'view_managed': False, 'view_own': True}}
    monkeypatch.setattr(sales_access_service, 'role_grants', lambda request: iter([('audit_sales', p)]))
    monkeypatch.setattr(sales_access_service, 'managed', lambda *args: True)
    monkeypatch.setattr(customer_access_service, 'transaction_access', lambda role: 'detail')
    token = sales_access_service.presentation_request.set(request)
    try:
        report_events = principal.collect_data(request)[2]
        original = deepcopy(report_events)
        rules.classify_visible_events(report_events, until='2026-01-03')
        result = principal.analyze(request, PrincipalQuery(tab='orders', organization_id='audit_org', date_from=date(2026, 1, 1), date_to=date(2026, 1, 31)))
    finally:
        sales_access_service.presentation_request.reset(token)
    assert len(report_events) == 1
    assert report_events[0]['id'] == 'purchase:group_case:2'
    assert report_events[0]['classification'] == '升单'
    assert result['total'] == 1
    assert result['items'][0]['classification'] == '升单'
    classification_fields = {'purchase_rule_keys', 'purchase_rule_labels', 'purchase_rule_conflicts', 'classification', 'is_upsell', 'repeat_times'}
    assert {k: v for k, v in report_events[0].items() if k not in classification_fields} == {k: v for k, v in original[0].items() if k not in classification_fields}


@pytest.mark.parametrize('origin,expected', [('previous_stage', ['转化', '升单', '复购']), ('history', ['转化', '其他成交', '其他成交'])])
def test_explicit_counter_origin_supports_first_big_after_conversion(origin, expected):
    draft = rules.recommended_rules()
    upsell = next(r for r in draft if r['key'] == 'upsell')
    upsell['count_from'] = origin
    upsell['conditions'][0]['operator'] = 'eq'
    validated = UpsellConfigUpdate(rules=draft)
    events = [event(i) for i in [1, 2, 3]]
    rules.classify_purchases(events, [r.model_dump() for r in validated.rules])
    assert [e['classification'] for e in events] == expected


@pytest.mark.parametrize('endpoint,method', [('/api/upsell-config', 'put'), ('/api/upsell-config/preview', 'post')])
def test_parent_category_contradiction_and_core_overlap_rejected(client, endpoint, method):
    drafts = [config(conversion=[{'product': 'energy', 'previous_products': ['membership:次卡'], 'excluded_previous_products': ['membership']}]),
              config(conversion=[{'product': 'energy'}], upsell=[{'product': 'energy'}])]
    before = rules.list_rules()
    for draft in drafts:
        response = getattr(client, method)(endpoint, json={'rules': draft})
        assert response.status_code == 422, response.text
    assert rules.list_rules() == before


def test_valid_independent_stages_and_nonconflicting_counts_allowed():
    draft = config(experience=[{'product': 'energy'}], assessment=[{'product': 'energy'}],
                   conversion=[{'product': 'energy', 'count': 1}], upsell=[{'product': 'energy', 'count': 2}],
                   repurchase=[{'product': 'energy', 'count': 3, 'operator': 'gte'}])
    draft = [r.model_dump() for r in UpsellConfigUpdate(rules=draft).rules]
    events = [event(i) for i in [1, 2, 3, 4]]
    rules.classify_purchases(events, draft)
    assert events[0]['purchase_rule_keys'] == ['experience', 'conversion', 'assessment']
    assert [e['purchase_rule_keys'] for e in events[1:]] == [['upsell'], ['repurchase'], ['repurchase']]
    # 未买过次卡不等于未买过任何会员卡：其他卡仍可满足前置条件。
    UpsellConfigUpdate(rules=config(conversion=[{'product': 'energy', 'previous_products': ['membership'], 'excluded_previous_products': ['membership:次卡']}]))


def test_old_conflicts_load_with_warning_and_never_double_count(client, monkeypatch):
    draft = config(conversion=[{'product': 'energy'}], upsell=[{'product': 'energy'}])
    save_data(rules.UPSELL_FILE, {'order': {'rules': draft}})
    rules._load()
    response = client.get('/api/upsell-config')
    assert response.status_code == 200
    assert response.json()['warnings']
    events = [event(1)]
    rules.classify_purchases(events)
    assert events[0]['classification'] == '规则冲突'
    assert events[0]['purchase_rule_keys'] == []
    assert events[0]['purchase_rule_conflicts'] == ['conversion', 'upsell']


def test_counter_origin_roundtrip_and_missing_prerequisite_rejected(client):
    draft = rules.recommended_rules()
    response = client.put('/api/upsell-config', json={'rules': draft})
    assert response.status_code == 200, response.text
    rules._load()
    assert rules.list_rules() == draft
    assert response.json()['warnings'] == []
    legacy = deepcopy(draft)
    for r in legacy:
        r.pop('count_from', None)
    assert client.put('/api/upsell-config', json={'rules': legacy}).status_code == 200
    rules._load()
    assert rules.list_rules() == legacy
    draft[3]['previous_stage'] = ''
    assert client.put('/api/upsell-config', json={'rules': draft}).status_code == 422
    draft = rules.recommended_rules()
    draft[1]['conditions'] = []
    assert client.put('/api/upsell-config', json={'rules': draft}).status_code == 422
