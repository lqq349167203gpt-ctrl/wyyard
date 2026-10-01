"""接口审计固定清单的定向契约回归，所有来源使用测试替身。"""
import asyncio
import importlib
import json
from types import SimpleNamespace as NS
from urllib.parse import urlencode

import pytest
from starlette.requests import Request

from app.api import client as client_api
from app.api import customers
from app.services import customer_access_service
from app.utils.payment_list import payment_list_response


def request(params=''):
    return Request({'type': 'http', 'query_string': params.encode(), 'headers': [],
                    'state': {'user_id': 'a', 'user_roles': ['超级管理员']}})


class Record:
    def __init__(self, data):
        self.data = data
        self.id = data['id']

    def model_dump(self, **kwargs):
        return dict(self.data)


@pytest.mark.parametrize('module,service,loader,handler,subtype', [
    ('membership_cards', 'membership_card_service', 'list_cards', 'list_cards', 'card_type'),
    ('group_cases', 'group_case_service', 'list_cases', 'list_cases', ''),
    ('emotional_releases', 'emotional_release_service', 'list_releases', 'list_releases', ''),
    ('energy_knots', 'energy_knot_service', 'list_knots', 'list_knots', ''),
    ('oh_card_readings', 'oh_card_reading_service', 'list_readings', 'list_readings', ''),
    ('internal_courses', 'internal_course_service', 'list_courses', 'list_courses', 'course_type'),
    ('tea_seat_fees', 'tea_seat_fee_service', 'list_fees', 'list_fees', ''),
    ('offline_courses', 'offline_course_service', 'list_courses', 'list_courses', ''),
    ('other_projects', 'other_project_service', 'list_projects', 'list_projects', 'project_name'),
])
def test_all_payment_types_filter_before_paging_keep_complete_visible_options(monkeypatch, module, service, loader, handler, subtype):
    from app.services import customer_service
    api = importlib.import_module('app.api.' + module)
    rows = [Record({'id': str(i), 'customer_id': 'c', 'nickname': '昵称', 'created_by': '甲' if i < 21 else '乙',
                    'created_at': f'{i:03}', subtype or 'irrelevant': '目标' if i < 21 else '其他'}) for i in range(23)]
    rows.append(Record({'id': 'hidden', 'created_by': '秘密', 'customer_id': 'hidden'}))
    monkeypatch.setattr(getattr(api, service), loader, lambda: rows)
    monkeypatch.setattr(customer_access_service, 'require_transaction_access', lambda *a, **k: None)
    monkeypatch.setattr(customer_access_service, 'filter_record_dicts', lambda req, items: [i for i in items if i['customer_id'] != 'hidden'])
    monkeypatch.setattr(customer_service, 'list_customers', lambda: [NS(id='c', name='真实姓名')])
    remaining_calls = []
    for name in ['membership_card_service', 'group_case_session_service', 'emotional_release_session_service', 'energy_knot_session_service', 'other_project_service']:
        provider = getattr(api, name, None)
        if provider:
            for method in ['get_card_effective_remaining', 'get_purchase_remaining', 'get_effective_remaining']:
                if hasattr(provider, method):
                    monkeypatch.setattr(provider, method, lambda id: remaining_calls.append(id) or 3)
    params = {'include_filter_options': 'true', 'keyword': '真实', 'creator_names': json.dumps(['甲'], ensure_ascii=False)}
    if subtype:
        params['subtypes'] = json.dumps(['目标'], ensure_ascii=False)
    kwargs = dict(request=request(urlencode(params)), page=2, page_size=20, customer_ids=None, nickname=None, closer_name=None)
    if module == 'membership_cards':
        kwargs['card_type'] = None
    result = getattr(api, handler)(**kwargs)
    assert result['total'] == 21 and len(result['items']) == 1
    assert {option['name'] for option in result['creator_options']} == {'甲', '乙'}
    if subtype:
        assert {option['name'] for option in result['subtype_options']} == {'目标', '其他'}
    # 没有分页的旧调用仍返回完整数组；余量只计算实际返回的页。
    assert len(remaining_calls) <= 1
    kwargs.update(request=request(), page=None)
    assert len(getattr(api, handler)(**kwargs)) == 23


def test_payment_invalid_multi_selection_fails_explicitly():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        payment_list_response(request('creator_names=not-json'), [], 1, 20)
    assert error.value.status_code == 422


def test_customer_selector_retains_complete_visible_directory_without_visit_statistics(monkeypatch):
    fields = ['nickname', 'name', 'gender', 'member_type', 'traffic_source', 'traffic_source_detail', 'referrer', 'service_teacher', 'referral_date', 'space_id']
    people = [NS(id=str(i), positions=[], position_sort_orders={}, created_at=None, **dict.fromkeys(fields, '')) for i in range(1001)]
    monkeypatch.setattr(customers.customer_service, 'list_customers', lambda: people)
    monkeypatch.setattr(customer_access_service, 'filter_customers', lambda *_: people[:-1])
    calls = []
    monkeypatch.setattr(customers.visit_service, 'list_basic_visits', lambda ids: calls.append(ids) or [NS(customer_id='0', arrived=True, visit_date='2026-10-01')])
    result = asyncio.run(customers.list_customers_light(request(), 'selector'))
    assert len(result) == 1000 and 'visit_count' not in result[0] and calls == []
    full = asyncio.run(customers.list_customers_light(request(), 'full'))
    assert full[0]['visit_count'] == 1 and len(calls) == 1


def test_client_activity_formats_only_requested_page_without_changing_sort_or_total(monkeypatch):
    records = [{'id': str(i), 'date': '2026-10-01', 'data': {'start_time': f'{i:03}'}, 'type': 'class'} for i in range(123)]
    monkeypatch.setattr(client_api, '_aggregate_published_activities', lambda: records)
    monkeypatch.setattr(client_api, '_build_customer_map', lambda: {})
    monkeypatch.setattr(client_api, '_get_space_map', lambda: ({}, {}))
    monkeypatch.setattr(client_api, '_signup_map', lambda: {})
    monkeypatch.setattr(client_api, '_activity_signup_count', lambda *_: 0)
    formatted = []
    monkeypatch.setattr(client_api, '_format_activity', lambda item, *args: formatted.append(item['id']) or {'id': item['id']})
    result = client_api.list_activities(2, 20, '2026-10-01', '2026-10-01')
    assert formatted == [str(i) for i in range(20, 40)]
    assert result['total'] == 123 and result['total_pages'] == 7


def test_audit_range_loads_each_source_once_not_once_per_day(monkeypatch):
    from collections import Counter

    from app.services import (
        class_record_service,
        customer_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
        missing_check_service,
        visit_service,
    )
    calls = Counter()
    monkeypatch.setattr(customer_service, 'list_customers', lambda: [])
    for service, method in [(class_record_service, 'list_records'),
                            (emotional_release_session_service, 'list_sessions'),
                            (energy_knot_session_service, 'list_sessions'),
                            (group_case_session_service, 'list_sessions'),
                            (internal_course_session_service, 'list_sessions'),
                            (visit_service, 'list_visits')]:
        key = service.__name__
        def load(*args, _key=key, **kwargs):
            assert kwargs['start_date'] == '2026-09-01'
            assert kwargs['end_date'] == '2026-09-24'
            calls[_key] += 1
            return []
        monkeypatch.setattr(service, method, load)
    result = missing_check_service.check('2026-09-01', '2026-09-24', kinds=set(missing_check_service.default_kinds()))
    assert len(result['days']) == 24
    assert len(calls) == 6 and set(calls.values()) == {1}
