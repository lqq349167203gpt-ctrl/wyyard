import pytest

from tests.test_visit_notes import _create_other_headers


@pytest.mark.parametrize("category,field", [("customer_info", "feedback"), ("follow_up", "healing_notes")])
@pytest.mark.parametrize("origin", ["course", "visit"])
def test_course_and_visit_edit_one_daily_note(client, created_customer, category, field, origin):
    customer_id = created_customer["id"]
    day = "2026-10-01"
    course_response = client.post("/api/class-records", json={
        "date": day, "start_time": "10:00", "end_time": "11:00",
        "course_id": "shared-note-course", "course_name": "当天课程",
        "course_type": "沙龙", "participant_ids": [customer_id],
    })
    assert course_response.status_code == 200, course_response.text
    course_id = course_response.json()["id"]
    payload = {"activity_source": "class_record", "session_id": course_id,
               "customer_id": customer_id, "category": category, "content": "首次填写"}

    if origin == "course":
        # 兼容先从课表录入、之后才创建当天邀约的历史记录。
        saved = client.post("/api/class-records/participant-notes", json=payload)
    visit_response = client.post("/api/visits", json={"visit_date": day, "customer_id": customer_id})
    assert visit_response.status_code == 200, visit_response.text
    visit_id = visit_response.json()["id"]
    if origin == "visit":
        saved = client.post("/api/visit-notes", json={"visit_id": visit_id, "category": category, "content": "首次填写"})
    assert saved.status_code == 200, saved.text

    def course_notes():
        response = client.get("/api/class-records/participant-notes/list", params={
            "activity_source": "class_record", "session_id": course_id, "customer_ids": customer_id,
        })
        assert response.status_code == 200, response.text
        return response.json()

    def visit_notes():
        response = client.get("/api/visit-notes", params={"visit_id": visit_id})
        assert response.status_code == 200, response.text
        return response.json()

    assert len(course_notes()) == len(visit_notes()) == 1
    assert course_notes()[0]["content"] == visit_notes()[0]["content"] == "首次填写"
    _, other_headers = _create_other_headers(client)
    own_visit_note = visit_notes()[0]
    denied = client.patch(f"/api/visit-notes/{own_visit_note['id']}",
                          json={"content": "不能改他人"}, headers=other_headers)
    assert denied.status_code == 403

    changed = client.post("/api/class-records/participant-notes", json={**payload, "content": "课表修改"})
    assert changed.status_code == 200, changed.text
    assert len(visit_notes()) == 1
    assert visit_notes()[0]["content"] == "课表修改"
    own_visit_note = visit_notes()[0]
    changed = client.patch(f"/api/visit-notes/{own_visit_note['id']}", json={"content": "邀约修改"})
    assert changed.status_code == 200, changed.text
    assert len(course_notes()) == 1
    assert course_notes()[0]["content"] == "邀约修改"
    daily = client.get("/api/visits", params={"date": day}).json()
    row = next(row for row in daily if row["id"] == visit_id)
    assert "邀约修改" in row[field]
    assert "首次填写" not in row[field]
    assert course_notes()[0]["created_by"] in row[field]

    # 同日多堂课只是快捷入口，不能重复存一份；另一天不能带出当天内容。
    second_course = client.post("/api/class-records", json={
        "date": day, "start_time": "14:00", "end_time": "15:00",
        "course_id": "shared-note-course-2", "course_name": "第二堂",
        "course_type": "沙龙", "participant_ids": [customer_id],
    }).json()
    changed = client.post("/api/class-records/participant-notes", json={
        **payload, "session_id": second_course["id"], "content": "第二堂修改",
    })
    assert changed.status_code == 200, changed.text
    assert len(course_notes()) == len(visit_notes()) == 1
    assert course_notes()[0]["content"] == "第二堂修改"
    tomorrow = client.post("/api/visits", json={"visit_date": "2026-10-02", "customer_id": customer_id}).json()
    assert client.get("/api/visit-notes", params={"visit_id": tomorrow["id"]}).json() == []
    # 重载持久化记录后两个入口仍一致，而不是依赖临时缓存。
    from app.services import activity_participant_note_service, visit_note_service

    activity_participant_note_service._load()
    visit_note_service._load()
    assert course_notes()[0]["content"] == visit_notes()[0]["content"] == "第二堂修改"
    own_course_note = course_notes()[0]
    denied = client.delete(f"/api/class-records/participant-notes/{own_course_note['id']}", headers=other_headers)
    assert denied.status_code == 403
    another = client.post("/api/visit-notes", json={
        "visit_id": visit_id, "category": category, "content": "另一人填写",
    }, headers=other_headers)
    assert another.status_code == 200, another.text
    assert len(course_notes()) == len(visit_notes()) == 2
    deleted = client.delete(f"/api/class-records/participant-notes/{own_course_note['id']}")
    assert deleted.status_code == 200, deleted.text
    assert len(course_notes()) == len(visit_notes()) == 1
    assert course_notes()[0]["content"] == visit_notes()[0]["content"] == "另一人填写"
    row = next(row for row in client.get("/api/visits", params={"date": day}).json() if row["id"] == visit_id)
    assert "第二堂修改" not in row[field]
    assert "另一人填写" in row[field]
