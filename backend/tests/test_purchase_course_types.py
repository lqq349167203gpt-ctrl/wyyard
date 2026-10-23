"""课程规则目录、改名、旧规则兼容及实际上课数据联动。"""
from types import SimpleNamespace as NS

import pytest

from app.models.upsell_config import PURCHASE_RULE_LABELS, PurchaseRule
from app.services import course_rule_catalog as catalog
from app.services import course_type_service as types
from app.services import course_workflow_service as workflow
from app.services import upsell_config_service as rules
from app.services.storage import load_data, save_data


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    before = {name: load_data(name) for name in (types.FILENAME, rules.UPSELL_FILE)}
    monkeypatch.setattr(types, '_types', [])
    monkeypatch.setattr(types, 'list_courses', lambda: [])
    monkeypatch.setattr(rules, '_rules', None)
    monkeypatch.setattr(rules, '_levels', [])
    yield
    for name, data in before.items():
        save_data(name, data)


def config(key, public=False):
    return [{'key': stage, 'conditions': [{'event_kind': 'attendance', 'products': [key],
             'public_welfare_only': public, 'count': 1, 'operator': 'gte'}] if stage == 'experience' else []}
            for stage in PURCHASE_RULE_LABELS]


def attended(name, *, public=True, kind='class'):
    return {'id': 'attended', 'date': '2026-01-01', 'customer_id': 'c1', 'kind': 'attendance',
            'product': kind, 'subtype': name, 'is_public_welfare': public}


def test_dynamic_options_and_new_course_can_save_preview_classify(client):
    created = client.post('/api/course-types', json={'name': '颂钵体验'}).json()
    key = 'class:' + created['id']
    data = client.get('/api/upsell-config').json()
    assert {'key': key, 'label': '颂钵体验', 'parent': 'class'} in data['activities']
    saved = client.put('/api/upsell-config', json={'rules': config(key)})
    assert saved.status_code == 200, saved.text
    preview = client.post('/api/upsell-config/preview', json={'rules': config(key)})
    assert preview.status_code == 200
    assert next(r for r in preview.json()['items'] if '颂钵体验' in r['journey'])['classification'] == '体验'
    event = attended('颂钵体验')
    rules.classify_purchases([event])
    assert event['purchase_rule_keys'] == ['experience']
    # 类型已被规则引用，即使还没有课程记录也不能删除。
    blocked = client.delete('/api/course-types/颂钵体验')
    assert blocked.status_code == 409
    assert '升单配置' in blocked.json()['detail']
    assert client.put('/api/upsell-config', json={'rules': [{'key': k, 'conditions': []} for k in PURCHASE_RULE_LABELS]}).status_code == 200
    assert client.delete('/api/course-types/颂钵体验').status_code == 200


def test_legacy_read_is_nonwriting_and_rename_preserves_rule_and_default(client, monkeypatch):
    # 模拟升级前按名称保存的目录和规则；读取不能自动覆盖业务配置。
    stored_types = {'types': {'types': [{'name': '读书会', 'category': 'salon'}]}}
    save_data(types.FILENAME, stored_types)
    types._load()
    legacy = config('class:读书会', True)
    saved_config = {'order': {'rules': legacy}}
    save_data(rules.UPSELL_FILE, saved_config)
    rules._load()
    before = client.get('/api/upsell-config').json()
    key = before['rules'][0]['conditions'][0]['products'][0]
    assert key.startswith('class:type-')
    assert load_data(types.FILENAME) == stored_types
    assert load_data(rules.UPSELL_FILE) == saved_config
    assert client.put('/api/course-types/读书会/rename', json={'new_name': '共读沙龙'}).status_code == 200
    types._load()
    rules._load()
    after = client.get('/api/upsell-config').json()
    assert after['rules'][0]['conditions'][0]['products'] == [key]
    assert next(t for t in after['activities'] if t['key'] == key)['label'] == '共读沙龙'
    assert after['recommended_rules'][0]['conditions'][1]['products'] == [key]
    assert after['recommended_warnings'] == []
    for name in ['读书会', '共读沙龙']:
        e = attended(name)
        rules.classify_purchases([e])
        assert e['classification'] == '体验'
    e = attended('共读沙龙', public=False)
    rules.classify_purchases([e])
    assert e['purchase_rule_keys'] == []
    # 旧页面仍提交旧名称，也要落成固定编号，不能重新绑定。
    response = client.put('/api/upsell-config', json={'rules': legacy})
    assert response.status_code == 200
    assert load_data(rules.UPSELL_FILE)['order']['rules'][0]['conditions'][0]['products'] == [key]
    # 防止其他类型复用旧名称，错误接管仍在使用的旧规则。
    assert client.post('/api/course-types', json={'name': '读书会'}).status_code == 409
    assert client.delete('/api/course-types/共读沙龙').status_code == 409
    previews = client.post('/api/upsell-config/preview', json={'rules': after['recommended_rules']}).json()['items']
    assert next(r for r in previews if r['journey'] == '公益共读沙龙')['classification'] == '体验'


def test_default_missing_course_warns_and_unknown_rules_cannot_save(client):
    data = client.get('/api/upsell-config').json()
    assert data['recommended_warnings']
    assert len(data['recommended_rules'][0]['conditions']) == 1
    assert all(item['label'] != '读书会' for item in data['activities'])
    assert client.put('/api/upsell-config', json={'rules': config('class:已删除类型')}).status_code == 400
    rules.replace_rules([PurchaseRule(**r) for r in config('class:已删除类型')])
    data = client.get('/api/upsell-config').json()
    assert any('课程类型已失效' in warning for warning in data['warnings'])
    assert any(item['label'] == '已删除类型（已失效）' for item in data['activities'])


@pytest.mark.parametrize('kind', ['class', 'gcs', 'ers', 'eks', 'ics'])
def test_every_selectable_source_uses_actual_attendance(monkeypatch, kind):
    from app.api import statistics
    from app.services import class_record_service, course_attendance_service, visit_service
    types.create_course_type('新课')
    record = NS(id='record', is_deleted=False, date='2026-01-01', course_type='新课',
                is_public_welfare=True, participant_ids=['c1', 'not-attended', 'withdrawn', 'teacher', 'owner'],
                teacher_ids=['teacher'], owner_id='owner', withdrawn_participant_ids=['withdrawn'], description='')
    monkeypatch.setattr(statistics, 'COURSE_ACTIVITY_TYPES', [(kind, '测试课', lambda: [record])])
    monkeypatch.setattr(workflow, 'all_orders', lambda: [])
    monkeypatch.setattr(course_attendance_service, 'snapshot', lambda: {})
    monkeypatch.setattr(visit_service, 'get_arrived_customer_ids_by_date', lambda: {})
    monkeypatch.setattr(course_attendance_service, 'attended_ids', lambda *args, **kw: {'c1', 'withdrawn', 'teacher', 'owner', 'not-registered'})
    monkeypatch.setattr(class_record_service, '_get_group_member_ids', lambda r: {'c1', 'not-attended'})
    events = workflow.stage_events()
    assert len(events) == 1 and events[0]['customer_id'] == 'c1'
    key = catalog.resolve_key('class:新课') if kind == 'class' else kind
    rules.classify_purchases(events, config(key))
    assert events[0]['classification'] == '体验'
    assert events[0]['id'] == f'attendance:{kind}:record:c1'
    assert workflow.all_orders() == []


def test_id_survives_multiple_renames_and_restart(client):
    row = types.create_course_type('甲课程')
    key = 'class:' + row['id']
    assert client.put('/api/upsell-config', json={'rules': config(key)}).status_code == 200
    for previous, new in [('甲课程', '乙课程'), ('乙课程', '丙课程')]:
        assert types.rename_course_type(previous, new)
        types._load()
        rules._load()
        assert catalog.resolve_key('class:' + new) == key
    assert catalog.resolve_key('class:甲课程') == key
    assert catalog.resolve_key('class:乙课程') == key
    assert rules.list_rules()[0]['conditions'][0]['products'] == [key]
    assert client.post('/api/upsell-config/preview', json={'rules': rules.list_rules()}).status_code == 200


def test_renamed_real_record_and_rule_still_match(monkeypatch):
    from datetime import datetime, timezone

    from app.models.class_record import ClassRecord
    from app.services import class_record_service, course_attendance_service, visit_service
    types.create_course_type("读书会")
    key = catalog.book_club_key()
    rules.replace_rules([PurchaseRule(**r) for r in config(key, True)])
    now = datetime.now(timezone.utc)
    record = ClassRecord(id="rename_record", date="2026-01-01", course_id="", course_name="今日共读",
                         course_type="读书会", participant_ids=["c1"], is_public_welfare=True,
                         created_at=now, updated_at=now)
    monkeypatch.setattr(class_record_service, "_records", {record.id: record})
    original = load_data(class_record_service.FILENAME)
    monkeypatch.setattr(workflow, "all_orders", lambda: [])
    monkeypatch.setattr(course_attendance_service, "snapshot", lambda: {})
    monkeypatch.setattr(visit_service, "get_arrived_customer_ids_by_date", lambda: {})
    monkeypatch.setattr(course_attendance_service, "attended_ids", lambda *args, **kw: {"c1"})
    try:
        assert types.rename_course_type("读书会", "共读新类型")
        assert record.course_type == "共读新类型"
        assert load_data(class_record_service.FILENAME)[record.id]["course_type"] == "共读新类型"
        events = workflow.stage_events()
        rules.classify_purchases(events)
        assert next(e for e in events if e['id'] == 'attendance:class:rename_record:c1')['classification'] == '体验'
    finally:
        save_data(class_record_service.FILENAME, original)
