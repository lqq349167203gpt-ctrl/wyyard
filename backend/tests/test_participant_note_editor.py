"""课程参与者与邀约必须共用备注字段、标签、跟进安排和本人编辑规则。"""

import pytest
from app.api.customer_follow_ups import CustomerFollowUpCreate, CustomerFollowUpUpdate
from app.models.visit_note import VisitNoteCreate, VisitNoteUpdate
from app.services import visit_note_service

from tests.test_visit_notes import _create_other_headers, _create_visit


def test_participant_models_inherit_shared_note_contract():
    assert set(VisitNoteCreate.model_fields) <= set(CustomerFollowUpCreate.model_fields)
    assert set(VisitNoteUpdate.model_fields) <= set(CustomerFollowUpUpdate.model_fields)


@pytest.mark.parametrize("category", ["visit_need", "customer_info", "follow_up", "customer_feedback"])
def test_clear_own_note_keeps_others_and_allows_reentry(client, created_customer, category):
    visit = _create_visit(client, created_customer["id"])
    _, other_headers = _create_other_headers(client)
    other = client.post("/api/visit-notes", headers=other_headers, json={
        "visit_id": visit["id"], "category": category, "content": "别人的内容",
    }).json()
    mine = client.post("/api/customer-follow-ups", json={
        "visit_id": visit["id"], "category": category, "content": "需要清空的内容",
    })
    assert mine.status_code == 200, mine.text
    note = mine.json()
    assert note["created_by_id"]
    assert client.patch(f"/api/customer-follow-ups/{note['id']}", json={"content": ""}, headers=other_headers).status_code == 403
    cleared = client.patch(f"/api/customer-follow-ups/{note['id']}", json={"content": "  "})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["deleted"] is True
    assert client.get("/api/customer-follow-ups/my-note", params={"visit_id": visit["id"], "category": category}).json() is None
    notes = client.get("/api/visit-notes", params={"visit_id": visit["id"]}).json()
    assert [(row["id"], row["content"]) for row in notes] == [(other["id"], "别人的内容")]
    logs = client.get("/api/operation-logs", params={"entity_id": note["id"]}).json()
    assert any("清空本人填写" in row["content"] for row in logs)
    again = client.post("/api/customer-follow-ups", json={"visit_id": visit["id"], "category": category, "content": "重新录入"})
    assert again.status_code == 200, again.text


def test_tags_only_and_follow_up_plan_round_trip_across_entries(client, created_customer):
    visit = _create_visit(client, created_customer["id"])
    configured = client.post("/api/customer-tags", json={"name": f"公共需求_{created_customer['id']}",
        "scope": "public", "category": "visit_need", "description": ""})
    assert configured.status_code == 200, configured.text
    tag = configured.json()
    assert tag["id"] in {item["id"] for item in client.get("/api/customer-follow-ups/need-tags").json()}
    saved = client.post("/api/customer-follow-ups", json={"visit_id": visit["id"], "category": "visit_need",
        "content": "", "need_tag_ids": [tag["id"]]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["need_tags"] == [{"id": tag["id"], "name": tag["name"]}]
    from_visit = client.get("/api/visit-notes", params={"visit_id": visit["id"]}).json()
    assert from_visit[0]["id"] == saved.json()["id"] and from_visit[0]["need_tags"] == saved.json()["need_tags"]
    cleared = client.patch(f"/api/customer-follow-ups/{saved.json()['id']}", json={"content": "", "need_tag_ids": []})
    assert cleared.status_code == 200 and cleared.json()["deleted"]
    plan = {"next_follow_up_person_id": created_customer["id"], "next_follow_up_person": "伪造昵称", "next_follow_up_date": "2026-11-01"}
    follow = client.post("/api/customer-follow-ups", json={"visit_id": visit["id"], "category": "follow_up", "content": "跟进", **plan})
    assert follow.status_code == 200, follow.text
    assert follow.json()["next_follow_up_person"] == created_customer["nickname"]
    mine = client.get("/api/customer-follow-ups/my-note", params={"visit_id": visit["id"], "category": "follow_up"}).json()
    assert mine["next_follow_up_date"] == "2026-11-01"
    projected = visit_note_service.group_notes_by_visit([visit["id"]])[visit["id"]]["follow_up"][0]
    assert projected["id"] == mine["id"] and projected["created_by_id"] == mine["created_by_id"]
    assert projected["next_follow_up_date"] == mine["next_follow_up_date"]
    updated = client.patch(f"/api/customer-follow-ups/{mine['id']}", json={"content": "更新正文"})
    assert updated.status_code == 200 and updated.json()["next_follow_up_date"] == "2026-11-01"
    logs = client.get("/api/operation-logs", params={"entity_id": mine["id"]}).json()
    assert any("2026-11-01" in row["content"] and "下次跟进人" in row["content"] for row in logs)
    assert client.post("/api/customer-follow-ups", json={"visit_id": visit["id"], "category": "customer_info", "content": "不能设置计划", **plan}).status_code == 400
    assert client.patch(f"/api/customer-follow-ups/{mine['id']}", json={"content": "日期错误", "next_follow_up_date": "2026-02-30"}).status_code == 422


@pytest.mark.parametrize("category", ["customer_info", "follow_up", "customer_feedback"])
def test_participant_can_clear_record_entered_from_course_roster(client, created_customer, category):
    cid = created_customer["id"]
    day = "2026-10-26"
    course = client.post("/api/class-records", json={"date": day, "course_id": "shared-clear",
        "course_name": "清空跨入口测试", "participant_ids": [cid]}).json()
    visit = _create_visit(client, cid, visit_date=day)
    made = client.post("/api/class-records/participant-notes", json={"activity_source": "class_record",
        "session_id": course["id"], "customer_id": cid, "category": category, "content": "名单入口填错"})
    assert made.status_code == 200, made.text
    own = client.get("/api/customer-follow-ups/my-note", params={"visit_id": visit["id"], "category": category}).json()
    assert own and own["content"] == "名单入口填错"
    cleared = client.patch(f"/api/customer-follow-ups/{own['id']}", json={"content": ""})
    assert cleared.status_code == 200, cleared.text
    assert client.get("/api/customer-follow-ups/my-note", params={"visit_id": visit["id"], "category": category}).json() is None
    roster = client.get("/api/class-records/participant-notes/list", params={"activity_source": "class_record",
        "session_id": course["id"], "customer_ids": cid}).json()
    assert roster == []
