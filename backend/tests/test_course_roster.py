import uuid

from app.services import course_attendance_service, storage


def make_course(client, customer_id, **extra):
    response = client.post('/api/class-records', json={
        'date': '2026-09-09', 'course_id': uuid.uuid4().hex,
        'course_name': '名单测试课', 'participant_ids': [customer_id], **extra,
    })
    assert response.status_code == 200, response.text
    return response.json()


def get_roster(client, course, **kwargs):
    return client.get('/api/class-records/course-roster', params={
        'activity_source': 'class_record', 'session_id': course['id'],
    }, **kwargs)


def confirm(client, course, ids, **kwargs):
    return client.post('/api/class-records/course-roster/confirm', json={
        'activity_source': 'class_record', 'session_id': course['id'], 'customer_ids': ids,
    }, **kwargs)


def test_online_confirmation_is_persistent_idempotent_and_does_not_mark_visit_or_charge(client, created_customer):
    cid = created_customer['id']
    course = make_course(client, cid, activity_mode='线上')
    other = make_course(client, cid)
    assert get_roster(client, course).json()['participants'][0]['attended'] is False
    before = client.get(f'/api/customer-detail/{cid}').json()
    assert confirm(client, course, [cid, cid]).status_code == 200
    saved = storage.load_item(course_attendance_service.FILENAME, f"class_record:{course['id']}")
    assert saved[cid]['attended'] is True
    assert confirm(client, course, [cid]).status_code == 200
    assert saved == storage.load_item(course_attendance_service.FILENAME, f"class_record:{course['id']}")
    assert get_roster(client, course).json()['participants'][0]['attended'] is True
    assert get_roster(client, other).json()['participants'][0]['attended'] is False
    after = client.get(f'/api/customer-detail/{cid}').json()
    activities = {a['session_id']: a for a in after['activities']}
    assert activities[course['id']]['participated'] is True
    assert activities[other['id']]['participated'] is False
    assert activities[course['id']]['membership_deduction_count'] == 0
    assert client.get('/api/visits', params={'date': course['date'], 'customer_id': cid}).json() == []
    assert before['customer']['visit_count'] == after['customer']['visit_count']


def test_course_confirmation_rejects_outsiders_future_withdrawal_and_locked_course(client, created_customer):
    cid = created_customer['id']
    course = make_course(client, cid)
    assert confirm(client, course, ['not-in-class']).status_code == 400
    future = make_course(client, cid, date='2099-01-01')
    assert confirm(client, future, [cid]).status_code == 400
    assert client.post(f"/api/class-records/{course['id']}/withdrawals", json={'customer_id': cid}).status_code == 200
    assert confirm(client, course, [cid]).status_code == 400
    assert get_roster(client, course).json()['participants'][0]['withdrawn'] is True
    locked = make_course(client, cid, date='2026-09-10')
    assert client.post('/api/activity-themes/lock', json={'date': locked['date'], 'space_id': ''}).status_code == 200
    try:
        assert confirm(client, locked, [cid]).status_code == 423
        assert get_roster(client, locked).json()['can_confirm'] is False
    finally:
        client.post('/api/activity-themes/unlock', json={'date': locked['date'], 'space_id': ''})


def test_restored_participant_requires_new_confirmation(client, created_customer):
    cid = created_customer['id']
    course = make_course(client, cid)
    assert confirm(client, course, [cid]).status_code == 200
    assert client.post(f"/api/class-records/{course['id']}/withdrawals", json={'customer_id': cid}).status_code == 200
    assert client.delete(f"/api/class-records/{course['id']}/withdrawals/{cid}").status_code == 200
    assert get_roster(client, course).json()['participants'][0]['attended'] is False
    assert confirm(client, course, [cid]).status_code == 200
    assert get_roster(client, course).json()['participants'][0]['attended'] is True


def test_new_course_notes_do_not_overwrite_another_class_on_same_day(client, created_customer):
    cid = created_customer['id']
    first, second = make_course(client, cid), make_course(client, cid)
    def save(course, text):
        return client.post('/api/class-records/participant-notes', json={
            'activity_source': 'class_record', 'session_id': course['id'], 'customer_id': cid,
            'category': 'follow_up', 'content': text, 'course_only': True,
            'next_follow_up_person_id': cid, 'next_follow_up_date': '2026-09-12',
        })
    a, b = save(first, '第一堂课跟进'), save(second, '第二堂课跟进')
    assert a.status_code == b.status_code == 200, (a.text, b.text)
    assert a.json()['id'] != b.json()['id']
    for course, text in [(first, '第一堂课跟进'), (second, '第二堂课跟进')]:
        rows = client.get('/api/class-records/participant-notes/list', params={
            'activity_source': 'class_record', 'session_id': course['id'], 'course_only': True,
        }).json()
        assert [n['content'] for n in rows] == [text]
        assert rows[0]['next_follow_up_date'] == '2026-09-12'
    bad = client.delete(f"/api/class-records/course-roster/notes/{a.json()['id']}", params={
        'activity_source': 'class_record', 'session_id': second['id'],
    })
    assert bad.status_code == 404
    good = client.delete(f"/api/class-records/course-roster/notes/{a.json()['id']}", params={
        'activity_source': 'class_record', 'session_id': first['id'],
    })
    assert good.status_code == 200


def test_assigned_teacher_can_confirm_and_fill_without_invitation_page_permission(client, created_customer):
    teacher = created_customer
    student = client.post('/api/customers', json={'nickname': f'学员_{uuid.uuid4().hex[:8]}'}).json()
    course = make_course(client, student['id'], teacher_ids=[teacher['id']])
    other = make_course(client, student['id'])
    role = f'仅课表老师_{uuid.uuid4().hex[:8]}'
    assert client.post('/api/positions', json={'name': role}).status_code == 200
    assert client.put('/api/position-permissions/full', json={
        'position': role, 'pages': ['daily-activities'], 'edit_permissions': {
            'activities': 'view', 'activity_teachers': 'own', 'activity_participants': 'view',
            'customer_access': {'scope': 'all', 'detail_tabs': {'customer_info': True, 'follow_up': True, 'customer_feedback': True}},
        },
    }).status_code == 200
    password = f'Aa{uuid.uuid4().hex[:12]}'
    account = client.post('/api/accounts', json={'owner': teacher['nickname'], 'role': role,
        'username': uuid.uuid4().hex, 'password': password}).json()
    token = client.post('/api/accounts/login', json={'username': account['username'], 'password': password}).json()['token']
    headers = {'Authorization': f'Bearer {token}'}
    listed = get_roster(client, course, headers=headers)
    assert listed.status_code == 200, listed.text
    assert listed.json()['can_confirm'] is True
    assert listed.json()['feedback_people']['current_person']['name'] == teacher['nickname']
    assert confirm(client, course, [student['id']], headers=headers).status_code == 200
    assert confirm(client, other, [student['id']], headers=headers).status_code == 403
    note = client.post('/api/class-records/participant-notes', headers=headers, json={
        'activity_source': 'class_record', 'session_id': course['id'], 'customer_id': student['id'],
        'category': 'customer_info', 'content': '老师本场记录', 'course_only': True,
    })
    assert note.status_code == 200, note.text
    assert client.delete(f"/api/class-records/course-roster/notes/{note.json()['id']}", headers=headers,
        params={'activity_source': 'class_record', 'session_id': course['id']}).status_code == 200
    assert client.post(f"/api/class-records/{course['id']}/withdrawals", headers=headers,
        json={'customer_id': student['id']}).status_code == 200
    assert client.delete(f"/api/class-records/{other['id']}", headers=headers).status_code == 403


def test_roster_need_tags_and_text_respect_independent_permissions(client, created_customer, monkeypatch):
    from app.services import customer_access_service

    cid = created_customer['id']
    course = make_course(client, cid)
    visit = client.post('/api/visits', json={'visit_date': course['date'], 'customer_id': cid}).json()
    tag = client.post('/api/customer-tags', json={'name': f'标签_{uuid.uuid4().hex[:8]}', 'scope': 'public', 'category': 'visit_need'}).json()
    assert client.post('/api/visit-notes', json={'visit_id': visit['id'], 'category': 'visit_need',
        'content': '本日需求保密正文', 'need_tag_ids': [tag['id']]}).status_code == 200
    monkeypatch.setattr(customer_access_service, 'get_customer_permissions', lambda _: {
        'scope': 'all', 'detail_tabs': {'visit_need_tags': True, 'visit_need_detail': False}})
    result = get_roster(client, course)
    assert result.status_code == 200, result.text
    assert tag['name'] in result.text
    assert '本日需求保密正文' not in result.text
