from app.models.offline_course_record import OfflineCourseRecordCreate
from app.services import offline_course_record_service as service


def test_group_record_is_visible_for_each_participant_and_persisted(monkeypatch):
    saved = {}
    monkeypatch.setattr(service, "_records", {})
    monkeypatch.setattr(service, "save_item", lambda _f, key, value: saved.update({key: value}))
    record = service.create_record(OfflineCourseRecordCreate(
        participant_ids=["a", "b"], participant_names=["甲", "乙"], teacher="老师", record_date="2026-09-21", course_type="练习课", course_name="落地实践",
    ))
    assert record.customer_id == ""
    assert service.list_records("a") == [record]
    assert service.list_records("b") == [record]
    assert service.list_records("c") == []
    assert saved[record.id]["participant_ids"] == ["a", "b"]
    assert saved[record.id]["course_name"] == "落地实践"
    updated = service.update_record(record.id, OfflineCourseRecordCreate(content="兼容旧端编辑"))
    assert updated.participant_ids == ["a", "b"]
    assert updated.course_name == "落地实践"
    renamed = service.update_record(record.id, OfflineCourseRecordCreate(course_name="新的课程"))
    assert saved[record.id]["course_name"] == renamed.course_name == "新的课程"


def test_old_customer_record_still_matches(monkeypatch):
    monkeypatch.setattr(service, "_records", {})
    monkeypatch.setattr(service, "save_item", lambda *_: None)
    record = service.create_record(OfflineCourseRecordCreate(customer_id="old", customer_nickname="旧客户"))
    assert service.list_records("old") == [record]


def test_types_and_group_api(client):
    response = client.post("/api/offline-course-records/types", json={"name": "分组练习"})
    assert response.status_code == 200, response.text
    type_id = response.json()["id"]
    assert client.post("/api/offline-course-records/types", json={"name": "分组练习"}).status_code == 409
    assert client.post("/api/offline-course-records", json={"participant_ids": [], "record_date": "2026-09-21"}).status_code == 400
    response = client.post("/api/offline-course-records", json={"participant_ids": [], "teacher": "老师", "record_date": "2026-09-21", "course_type": "分组练习"})
    assert response.status_code == 200, response.text
    assert response.json()["customer_id"] == ""
    assert response.json()["course_type"] == "分组练习"
    record_id = response.json()["id"]
    assert client.delete(f"/api/offline-course-records/types/{type_id}").status_code == 409
    renamed = client.put(f"/api/offline-course-records/types/{type_id}", json={"name": "新练习课"})
    assert renamed.status_code == 200, renamed.text
    assert service.get_record(record_id).course_type == "新练习课"
    assert client.put(f"/api/offline-course-records/types/{type_id}", json={"name": "  "}).status_code == 400
    assert client.delete(f"/api/offline-course-records/{record_id}").status_code == 200
    assert client.delete(f"/api/offline-course-records/types/{type_id}").status_code == 200
