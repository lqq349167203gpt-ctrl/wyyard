import uuid

from app.middleware.jwt_auth import create_customer_token
from app.services import activity_followup_service


def _customer_headers(customer: dict) -> dict:
    token = create_customer_token(customer["id"], customer["nickname"])
    return {"Authorization": f"Bearer {token}"}


def test_activity_followup_is_bound_to_activity_and_can_be_updated(
    client,
    created_customer,
):
    suffix = uuid.uuid4().hex[:8]
    teacher_response = client.post("/api/customers", json={
        "nickname": f"回访老师_{suffix}",
        "name": f"回访老师_{suffix}",
    })
    assert teacher_response.status_code == 200
    teacher = teacher_response.json()

    activity_response = client.post("/api/class-records", json={
        "date": "2026-08-18",
        "start_time": "19:00",
        "end_time": "21:00",
        "course_id": f"followup-course-{suffix}",
        "course_name": "回访关联测试活动",
        "course_type": "测试活动",
        "teacher_ids": [teacher["id"]],
        "participant_ids": [created_customer["id"]],
    })
    assert activity_response.status_code == 200
    activity = activity_response.json()

    headers = _customer_headers(created_customer)
    first_response = client.post(
        "/api/client/activity-followups",
        headers=headers,
        json={
            "activity_type": "class",
            "session_id": activity["id"],
            "content": "第一次回访内容\n保留换行",
        },
    )
    assert first_response.status_code == 200
    first = first_response.json()
    assert first["activity_key"] == f"class:{activity['id']}"
    assert first["activity_name"] == "回访关联测试活动"
    assert first["activity_date"] == "2026-08-18"
    assert first["start_time"] == "19:00"
    assert first["end_time"] == "21:00"
    assert first["teacher"] == teacher["nickname"]
    assert first["customer_role"] == "参与者"

    update_response = client.post(
        "/api/client/activity-followups",
        headers=headers,
        json={
            "activity_type": "class",
            "session_id": activity["id"],
            "content": "修改后的回访内容",
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["id"] == first["id"]
    assert updated["content"] == "修改后的回访内容"

    records_response = client.get("/api/client/activity-records", headers=headers)
    assert records_response.status_code == 200
    activity_record = next(
        item
        for item in records_response.json()["items"]
        if item["activity_key"] == f"class:{activity['id']}"
    )
    assert activity_record["has_followup"] is True
    assert activity_record["followup_content"] == "修改后的回访内容"

    detail_response = client.get(f"/api/customer-detail/{created_customer['id']}")
    assert detail_response.status_code == 200
    followups = detail_response.json()["activity_followups"]
    matching = [
        item
        for item in followups
        if item["activity_key"] == f"class:{activity['id']}"
    ]
    assert len(matching) == 1
    assert matching[0]["teacher"] == teacher["nickname"]

    activity_followup_service.delete_followup(first["id"])
    client.delete(f"/api/class-records/{activity['id']}")
    client.delete(f"/api/customers/{teacher['id']}")


def test_customer_cannot_follow_up_an_unrelated_activity(client, created_customer):
    suffix = uuid.uuid4().hex[:8]
    other_response = client.post("/api/customers", json={
        "nickname": f"其他客户_{suffix}",
        "name": f"其他客户_{suffix}",
    })
    assert other_response.status_code == 200
    other_customer = other_response.json()

    activity_response = client.post("/api/class-records", json={
        "date": "2026-08-19",
        "course_id": f"followup-private-{suffix}",
        "course_name": "其他用户的活动",
        "participant_ids": [other_customer["id"]],
    })
    assert activity_response.status_code == 200
    activity = activity_response.json()

    response = client.post(
        "/api/client/activity-followups",
        headers=_customer_headers(created_customer),
        json={
            "activity_type": "class",
            "session_id": activity["id"],
            "content": "不应被保存",
        },
    )
    assert response.status_code == 404

    client.delete(f"/api/class-records/{activity['id']}")
    client.delete(f"/api/customers/{other_customer['id']}")
