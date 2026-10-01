"""按需读取与个人历史分页契约：统计、权限和旧调用不可被分页截断。"""
from datetime import datetime
from types import SimpleNamespace as NS
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException, Response

from app.api import client, customer_detail


@pytest.mark.parametrize('handler', ['transactions', 'deductions'])
def test_personal_histories_page_items_but_keep_complete_summaries(monkeypatch, handler):
    rows = [{'source_id': str(i)} for i in range(45)]
    monkeypatch.setattr(client, '_current_customer_id', lambda request: 'c')
    if handler == 'transactions':
        monkeypatch.setattr(client, '_build_payment_records', lambda _: rows)
        def call(**kwargs):
            return client.get_transactions(NS(), **kwargs)
    else:
        monkeypatch.setattr(client, '_build_purchase_summary', lambda _: [{'remaining': 8, 'debt_count': 6}])
        monkeypatch.setattr(client, '_build_client_deduction_items', lambda _: rows)
        monkeypatch.setattr(client, '_build_client_purchased_projects', lambda *args: [{'name': '卡'}])
        def call(**kwargs):
            return client.get_deductions(NS(), Response(), **kwargs)
    result = call(page=2, page_size=20)
    assert result['total'] == 45 and result['total_pages'] == 3
    assert result['items'] == rows[20:40]
    assert len(call()['items']) == 45
    if handler == 'deductions':
        assert result['purchase_summary'] == [{'remaining': 8, 'debt_count': 6}]
    with pytest.raises(HTTPException) as error:
        call(page=1, page_size=0)
    assert error.value.status_code == 422


def test_activity_status_filter_before_page_and_timeline_keeps_complete_counts(monkeypatch):
    monkeypatch.setattr(client, '_current_customer_id', lambda request: 'c')
    now = datetime.now(ZoneInfo('Asia/Shanghai'))
    today = now.date().isoformat()
    rows = [{'activity_key': str(i), 'date': today, 'start_time': '23:59', 'end_time': '', 'withdrawn': False} for i in range(45)]
    rows.append({'activity_key': 'withdrawn', 'date': today, 'withdrawn': True})
    monkeypatch.setattr(client, '_build_activities', lambda _: [dict(row) for row in rows])
    monkeypatch.setattr(client.activity_followup_service, 'list_followups', lambda _: [])
    monkeypatch.setattr(client.visit_service, 'list_visits', lambda **kwargs: [])
    result = client.get_activity_records(NS(), page=2, page_size=20, status='signedup')
    assert result['total'] == 45 and len(result['items']) == 20
    assert result['summary'] == {'total': 46, 'week_count': 46, 'signedup': 45, 'arrived': 0, 'missed': 0, 'withdrawn': 1}
    assert result['items'][0]['activity_key'] == '20'
    timeline = client.get_activity_records(NS(), timeline=True)
    assert len(timeline['items']) == 7 and timeline['summary']['total'] == 46
    assert len(client.get_activity_records(NS())['items']) == 46


def test_detail_sections_do_not_read_unselected_histories_and_cannot_bypass_permissions(monkeypatch):
    api = customer_detail
    request = NS(state=NS(user_role='员工', user_roles=['员工'], user_id='a', user_owner='甲', user_name='甲'))
    customer = NS(id='c', nickname='客户', is_deleted=False, model_dump=lambda **kwargs: {'id': 'c', 'nickname': '客户'})
    permissions = {'sensitive_fields': dict.fromkeys(api.customer_access_service.SENSITIVE_FIELD_MAP, True),
                   'detail_tabs': dict.fromkeys(['follow_up', 'activities', 'customer_followups', 'card_statistics', 'offline_courses', 'communication'], True),
                   'transaction_access': 'detail'}
    monkeypatch.setattr(api.customer_service, 'get_customer', lambda _: customer)
    monkeypatch.setattr(api.customer_access_service, 'can_view_customer_for_request', lambda *args: True)
    monkeypatch.setattr(api.customer_access_service, 'get_customer_permissions', lambda *args: permissions)
    monkeypatch.setattr(api.customer_contact_service, 'protect_customer_data', lambda data, *args, **kwargs: data)
    monkeypatch.setattr(api.visit_service, 'count_customer_visits', lambda _: 4)
    monkeypatch.setattr(api.visit_service, 'list_visits', lambda **kwargs: [])
    calls = []
    monkeypatch.setattr(api, '_build_payment_records', lambda *args: calls.append('payment') or [{'amount': 1}])
    monkeypatch.setattr(api, '_build_purchase_summary', lambda *args: calls.append('purchase') or [{'remaining': 8}])
    monkeypatch.setattr(api, '_build_activities', lambda *args, **kwargs: calls.append('activities') or [{'participated': True, 'activity_type': 'class'}])
    monkeypatch.setattr(api, '_build_offline_course_records', lambda *args: calls.append('offline') or [])
    basic = api.get_customer_detail('c', request, section='basic')
    assert calls == ['payment'] and basic['customer']['transaction_count'] == 1
    assert basic['purchase_summary'] == [] and basic['activities'] == []
    calls.clear()
    assert api.get_customer_detail('c', request, section='purchase')['purchase_summary'] == [{'remaining': 8}]
    assert calls == ['purchase']
    calls.clear()
    permissions['detail_tabs']['card_statistics'] = False
    assert api.get_customer_detail('c', request, section='purchase')['purchase_summary'] == []
    assert calls == []
    permissions['transaction_access'] = 'none'
    assert api.get_customer_detail('c', request, section='payment')['payment_records'] == []
    assert calls == []
