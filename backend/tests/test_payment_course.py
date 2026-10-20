import pytest
from app.services import payment_course_service, storage

DAY = "2026-10-18"


def test_course_organization_uses_course_then_teacher_and_keeps_settlement_separate(monkeypatch):
    from types import SimpleNamespace as NS

    from app.services import (
        class_record_service,
        course_service,
        course_type_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
        organization_service,
    )

    monkeypatch.setattr(organization_service, "list_organizations", lambda: [
        NS(id="course-org", name="课程组织", member_ids=[]),
        NS(id="teacher-org", name="老师组织", member_ids=["teacher"]),
    ])
    monkeypatch.setattr(course_service, "list_courses", lambda: [NS(id="course", name="配置课程", organization_id="course-org")])
    monkeypatch.setattr(course_type_service, "list_course_types", lambda: [])
    calls = []
    monkeypatch.setattr(class_record_service, "get_record", lambda key: calls.append(key) or NS(course_id="course", teacher_ids=["teacher"]))
    for service in (group_case_session_service, emotional_release_session_service,
                    energy_knot_session_service, internal_course_session_service):
        monkeypatch.setattr(service, "get_session", lambda key: NS(teacher_ids=["teacher"]))
    rows = [{"deal_course_key": "class_record:one", "organization_name": "成交组织"},
            {"deal_course_key": "class_record:one"},
            *({"deal_course_key": f"{source}:one"} for source in
              ("group_case", "emotional_release", "energy_knot", "internal_course")),
            {"deal_course_key": ""}, {"deal_course_key": "unknown:one"}]
    payment_course_service.fill_course_organizations(rows)
    assert [row["deal_course_organization_name"] for row in rows] == [
        "课程组织", "课程组织", "老师组织", "老师组织", "老师组织", "老师组织", "", "",
    ]
    assert calls == ["one"]
    assert rows[0]["organization_name"] == "成交组织"


@pytest.fixture
def deal_course(client, created_customer):
    response = client.post("/api/class-records", json={
        "date": DAY, "start_time": "10:00", "end_time": "11:00",
        "course_id": "deal-course-test", "course_name": "当天成交课",
        "course_type": "沙龙活动", "participant_ids": [created_customer["id"]],
    })
    assert response.status_code == 200, response.text
    record = response.json()
    yield record
    client.delete(f"/api/class-records/{record['id']}")


@pytest.mark.parametrize("path,filename,fields", [
    ("membership-cards", "membership_cards.json", {"card_type": "次卡", "price": 0}),
    ("group-cases", "group_cases.json", {"purchase_count": 1, "amount": 0}),
    ("emotional-releases", "emotional_releases.json", {"purchase_count": 1, "amount": 0}),
    ("energy-knots", "energy_knots.json", {"purchase_count": 1, "amount": 0}),
    ("oh-card-readings", "oh_card_readings.json", {"reading_type": "OH卡情感梳理", "diagnosis_teacher": "老师甲", "amount": 0}),
    ("tea-seat-fees", "tea_seat_fees.json", {"quantity": 1, "amount": 0}),
    ("offline-courses", "offline_courses.json", {"course_type": "主理人训练", "amount": 0}),
    ("internal-courses", "internal_courses.json", {"course_type": "OH卡技能梳理", "price": 0}),
    ("other-projects", "other_projects.json", {"project_name": "测试项目", "fee": 0}),
])
def test_every_payment_can_save_edit_clear_course(client, created_customer, deal_course, path, filename, fields):
    key = f"class_record:{deal_course['id']}"
    payload = {"customer_id": created_customer["id"], "nickname": created_customer["nickname"],
               "deal_date": DAY, "effective_date": DAY, "deal_course_key": key,
               "deal_course_name": "客户端伪造标题", **fields}
    created = client.post(f"/api/{path}", json=payload)
    assert created.status_code == 200, created.text
    record = created.json()
    url = f"/api/{path}/{record['id']}"
    try:
        assert record["deal_course_key"] == key
        assert "当天成交课" in record["deal_course_name"]
        assert "伪造" not in record["deal_course_name"]
        assert storage.load_item(filename, record["id"])["deal_course_key"] == key
        # 不相关修改保留原关联；改变成交日期时不能保留另一日的课程。
        assert client.patch(url, json={"notes": "修改备注"}).json()["deal_course_key"] == key
        wrong_day = client.patch(url, json={"deal_date": "2026-10-19"})
        assert wrong_day.status_code == 400, wrong_day.text
        assert client.get(url).json()["deal_date"] == DAY
        cleared = client.patch(url, json={"deal_date": "2026-10-19", "deal_course_key": ""})
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["deal_course_key"] == cleared.json()["deal_course_name"] == ""
        reassigned = client.patch(url, json={"deal_date": DAY, "deal_course_key": key})
        assert reassigned.status_code == 200, reassigned.text
        assert client.get(url).json()["deal_course_key"] == key
        legacy = client.post(f"/api/{path}", json={k: v for k, v in payload.items() if not k.startswith("deal_course_")})
        assert legacy.status_code == 200, legacy.text
        assert legacy.json()["deal_course_key"] == legacy.json()["deal_course_name"] == ""
        client.delete(f"/api/{path}/{legacy.json()['id']}")
    finally:
        client.delete(url)


def test_options_only_contain_deal_day_and_require_permission(client, deal_course, monkeypatch):
    response = client.get("/api/payment-exports/course-options", params={"date": DAY})
    assert response.status_code == 200, response.text
    key = f"class_record:{deal_course['id']}"
    assert any(item["key"] == key for item in response.json())
    assert all(item["date"] == DAY for item in response.json())
    other = client.get("/api/payment-exports/course-options", params={"date": "2026-10-19"})
    assert not any(item["key"] == key for item in other.json())
    assert client.get("/api/payment-exports/course-options", params={"date": "错误"}).status_code == 400
    from fastapi import HTTPException

    def denied(*args, **kwargs):
        raise HTTPException(403, "没有交易详情权限")

    from app.services import customer_access_service

    monkeypatch.setattr(customer_access_service, "require_transaction_access", denied)
    assert client.get("/api/payment-exports/course-options", params={"date": DAY}).status_code == 403


def test_customer_course_options_only_include_attended_activities(monkeypatch):
    from app.api import class_records

    fields = ["class_records", "gcs_sessions", "ers_sessions", "eks_sessions", "ics_sessions"]
    rows = {field: [] for field in fields}
    rows["class_records"] = [
        {"id": "joined", "name": "参加了", "start_time": "10:00", "participants": [{"id": "c1", "withdrawn": False}]},
        {"id": "other", "name": "别人的", "start_time": "11:00", "participants": [{"id": "c2", "withdrawn": False}]},
        {"id": "left", "name": "已退出", "start_time": "12:00", "participants": [{"id": "c1", "withdrawn": True}]},
    ]
    monkeypatch.setattr(class_records, "read_day_courses", lambda *args, **kwargs: (rows, set()))
    attended = payment_course_service.course_options(DAY, customer_id="c1")
    assert [item["key"] for item in attended] == ["class_record:joined"]
    assert len(payment_course_service.course_options(DAY)) == 3


def test_course_sources_with_same_id_are_distinct(monkeypatch):
    from app.api import class_records

    fields = ["class_records", "gcs_sessions", "ers_sessions", "eks_sessions", "ics_sessions"]
    monkeypatch.setattr(class_records, "read_day_courses", lambda *args, **kwargs: (
        {field: [{"id": "same", "name": field, "start_time": "10:00"}] for field in fields}, set(),
    ))
    options = payment_course_service.course_options(DAY)
    assert len({item["key"] for item in options}) == 5


def test_coarse_deal_course_is_independent_of_deducted_course(client, created_customer):
    from tests.test_coarse_door_card import _create_organization_course

    org, course = _create_organization_course(client, "成交归因测试")
    customer_id = created_customer["id"]
    visit = client.post("/api/visits", json={"visit_date": DAY, "customer_id": customer_id, "arrived": True}).json()
    lessons = []
    for start, end in (("10:00", "11:00"), ("14:00", "15:00")):
        response = client.post("/api/class-records", json={
            "date": DAY, "start_time": start, "end_time": end, "course_id": course["id"], "course_name": course["name"],
            "course_type": "沙龙活动", "participant_ids": [customer_id],
        })
        assert response.status_code == 200, response.text
        lessons.append(response.json())
    key = f"class_record:{lessons[1]['id']}"
    payload = {"customer_id": customer_id, "record_type": "class", "record_id": lessons[0]["id"],
               "course_organization_id": org["id"], "settlement_organization_id": org["id"],
               "deal_date": DAY, "deal_course_key": key}
    try:
        response = client.post("/api/project-deductions/coarse-door-course", json=payload)
        assert response.status_code == 200, response.text
        record = response.json()
        assert record["source_activity_id"] == lessons[0]["id"]
        assert record["deal_course_key"] == key
        stored = storage.load_item("project_deductions.json", record["id"])
        assert stored["deal_course_key"] == key
        changed = client.patch(f"/api/project-deductions/coarse-door-course/{record['id']}", json={**payload, "deal_course_key": ""})
        assert changed.status_code == 200, changed.text
        assert changed.json()["source_activity_id"] == lessons[0]["id"]
        assert changed.json()["deal_course_key"] == changed.json()["deal_course_name"] == ""
        client.delete(f"/api/project-deductions/{record['id']}")
    finally:
        for lesson in lessons:
            client.delete(f"/api/class-records/{lesson['id']}?confirm_coarse_cancellation=1")
        client.delete(f"/api/visits/{visit['id']}?confirm_coarse_cancellation=1")
        client.delete(f"/api/courses/{course['id']}")
        client.delete(f"/api/organizations/{org['id']}")
