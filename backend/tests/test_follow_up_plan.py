import pytest

from tests.test_visit_notes import _create_other_headers, _create_visit


def test_follow_up_defaults_to_actor_and_plan_only_edits_are_logged(client, created_customer):
    visit = _create_visit(client, created_customer["id"])
    response = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "follow_up", "content": "下周了解近况"})
    assert response.status_code == 200, response.text
    note = response.json()
    assert note["next_follow_up_person"] == "不闹"
    assert note["next_follow_up_date"] == ""
    plan = {"next_follow_up_person_id": created_customer["id"], "next_follow_up_person": "不可信前端昵称",
            "next_follow_up_date": "2026-10-24"}
    changed = client.patch(f'/api/visit-notes/{note["id"]}', json={"content": note["content"], **plan})
    assert changed.status_code == 200, changed.text
    assert changed.json()["next_follow_up_person"] == created_customer["nickname"]
    assert changed.json()["next_follow_up_date"] == "2026-10-24"
    # 老版小程序/正文编辑调用没有计划字段时不能清掉计划。
    assert client.patch(f'/api/visit-notes/{note["id"]}', json={"content": "更新正文"}).json()["next_follow_up_date"] == "2026-10-24"
    preserved = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "follow_up", "content": "再次更新正文"})
    assert preserved.json()["next_follow_up_person_id"] == created_customer["id"]
    assert preserved.json()["next_follow_up_date"] == "2026-10-24"
    from app.services import visit_note_service

    visit_note_service._load()
    _, headers = _create_other_headers(client)
    others = client.get("/api/visit-notes", params={"visit_id": visit["id"]}, headers=headers).json()
    shared = next(item for item in others if item["id"] == note["id"])
    assert shared["next_follow_up_person"] == created_customer["nickname"] and shared["can_edit"] is False
    assert client.patch(f'/api/visit-notes/{note["id"]}', json={"content": "越权", **plan}, headers=headers).status_code == 403
    logs = client.get("/api/operation-logs", params={"entity_id": note["id"], "method": "UPDATE"}).json()
    assert any("下次跟进人：" + created_customer["nickname"] in row["content"] and "跟进时间：2026-10-24" in row["content"] for row in logs)
    cleared = client.patch(f'/api/visit-notes/{note["id"]}', json={"content": "再次更新正文",
        "next_follow_up_person_id": "", "next_follow_up_person": "", "next_follow_up_date": ""})
    assert cleared.status_code == 200 and cleared.json()["next_follow_up_date"] == ""


@pytest.mark.parametrize("origin", ["course", "visit"])
def test_shared_course_and_visit_note_keep_same_follow_up_plan(client, created_customer, origin):
    day = "2026-10-25"
    cid = created_customer["id"]
    course = client.post("/api/class-records", json={"date": day, "course_id": "plan-test",
        "course_name": "计划共享测试", "participant_ids": [cid]}).json()
    payload = {"activity_source": "class_record", "session_id": course["id"], "customer_id": cid,
               "category": "follow_up", "content": "先记录正文"}
    if origin == "course":
        response = client.post("/api/class-records/participant-notes", json=payload)
        assert response.status_code == 200, response.text
    visit = _create_visit(client, cid, visit_date=day)
    if origin == "visit":
        response = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "follow_up", "content": "先记录正文"})
        assert response.status_code == 200, response.text
    note = client.get("/api/visit-notes", params={"visit_id": visit["id"]}).json()[0]
    changed = client.patch(f'/api/visit-notes/{note["id"]}', json={"content": "先记录正文",
        "next_follow_up_person_id": cid, "next_follow_up_person": created_customer["nickname"], "next_follow_up_date": "2026-11-01"})
    assert changed.status_code == 200, changed.text
    # 从课程原有入口只编辑内容，不能覆盖邀约录入的计划。
    edited = client.post("/api/class-records/participant-notes", json={**payload, "content": "课程入口更新正文"})
    assert edited.status_code == 200, edited.text
    from app.services import activity_participant_note_service, visit_note_service

    activity_participant_note_service._load()
    visit_note_service._load()
    course_notes = client.get("/api/class-records/participant-notes/list", params={
        "activity_source": "class_record", "session_id": course["id"], "customer_ids": cid}).json()
    visit_notes = client.get("/api/visit-notes", params={"visit_id": visit["id"]}).json()
    assert len(course_notes) == len(visit_notes) == 1
    for item in [course_notes[0], visit_notes[0]]:
        assert item["next_follow_up_person_id"] == cid
        assert item["next_follow_up_date"] == "2026-11-01"
        assert item["content"] == "课程入口更新正文"
    # 同一份计划必须能到达参与者列表及每日报表，不能只在编辑接口里保留。
    grouped = visit_note_service.group_notes_by_visit([visit["id"]])[visit["id"]]["follow_up"]
    assert grouped[0]["next_follow_up_person_id"] == cid
    assert grouped[0]["next_follow_up_date"] == "2026-11-01"
    for mobile in (False, True):
        report = client.get("/api/daily-report", params={"date": day, "mobile": mobile})
        assert report.status_code == 200, report.text
        report_visit = next(row for row in report.json()["visits"] if row["id"] == visit["id"])
        assert report_visit["visit_notes"][0]["next_follow_up_person_id"] == cid
        assert report_visit["visit_notes"][0]["next_follow_up_date"] == "2026-11-01"


@pytest.mark.parametrize("extra,code", [
    ({"next_follow_up_person_id": "missing"}, 400),
    ({"next_follow_up_person": "不存在的人"}, 400),
    ({"next_follow_up_date": "2026-02-30"}, 422),
    ({"next_follow_up_date": "2026-2-3"}, 422),
])
def test_follow_up_rejects_invalid_person_or_date(client, created_customer, extra, code):
    visit = _create_visit(client, created_customer["id"])
    response = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "follow_up", "content": "跟进", **extra})
    assert response.status_code == code, response.text


def test_follow_up_people_only_exposes_active_names_and_non_follow_up_cannot_accept_plan(client, created_customer):
    people = client.get("/api/visit-notes/follow-up-people")
    assert people.status_code == 200
    assert next(item for item in people.json() if item["id"] == created_customer["id"])["nickname"] == created_customer["nickname"]
    assert all(set(item) == {"id", "nickname", "name"} for item in people.json())
    visit = _create_visit(client, created_customer["id"])
    response = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "customer_info",
        "content": "客户信息", "next_follow_up_date": "2026-11-01"})
    assert response.status_code == 400
