import uuid

from app.middleware.jwt_auth import create_customer_token
from app.services import activity_followup_service


def _customer_headers(customer: dict) -> dict:
    token = create_customer_token(customer["id"], customer["nickname"])
    return {"Authorization": f"Bearer {token}"}


def test_unpublished_participating_activity_is_visible_only_in_my_activities(
    client,
    created_customer,
):
    suffix = uuid.uuid4().hex[:8]
    activity_response = client.post("/api/class-records", json={
        "date": "2026-08-17",
        "start_time": "19:00",
        "end_time": "21:00",
        "course_id": f"draft-course-{suffix}",
        "course_name": "未发布的本人活动",
        "participant_ids": [created_customer["id"]],
        "is_published": False,
    })
    assert activity_response.status_code == 200
    activity = activity_response.json()
    headers = _customer_headers(created_customer)

    records_response = client.get("/api/client/activity-records", headers=headers)
    assert records_response.status_code == 200
    assert any(
        item["session_id"] == activity["id"]
        for item in records_response.json()["items"]
    )

    notifications_response = client.get("/api/client/notifications", headers=headers)
    assert notifications_response.status_code == 200
    assignment_notifications = [
        item
        for item in notifications_response.json()["items"]
        if item["type"] == "activity_assigned"
        and item["activity_name"] == "未发布的本人活动"
    ]
    assert len(assignment_notifications) == 1
    assignment = assignment_notifications[0]
    assert assignment["title"] == "活动安排"
    assert "活动名称：未发布的本人活动" in assignment["content"]
    assert "活动时间：19:00-21:00" in assignment["content"]
    assert "2026-08-17" not in assignment["content"]
    assert assignment["activity_date"] == "2026-08-17"
    assert "身份：参与者" in assignment["content"]
    assert "活动暂未发布" in assignment["content"]
    assert assignment["operator"] == "不闹"

    repeated_notifications = client.get("/api/client/notifications", headers=headers)
    repeated_assignments = [
        item
        for item in repeated_notifications.json()["items"]
        if item["type"] == "activity_assigned"
        and item["activity_name"] == "未发布的本人活动"
    ]
    assert len(repeated_assignments) == 1

    detail_response = client.get(
        f"/api/client/activities/{activity['id']}",
        headers=headers,
    )
    assert detail_response.status_code == 200

    public_response = client.get(
        "/api/client/activities?start_date=2026-08-17&end_date=2026-08-17",
    )
    assert public_response.status_code == 200
    assert all(
        item["id"] != activity["id"]
        for item in public_response.json()["items"]
    )

    client.delete(f"/api/class-records/{activity['id']}")


def test_all_activity_types_notify_assigned_customer(client, created_customer):
    suffix = uuid.uuid4().hex[:8]
    customer_id = created_customer["id"]
    nickname = created_customer["nickname"]
    date = "2026-08-19"
    invite = client.post("/api/visits", json={
        "visit_date": date,
        "customer_id": customer_id,
        "arrived": False,
    })
    assert invite.status_code == 200
    activity_specs = [
        (
            "/api/class-records",
            {
                "date": date,
                "course_id": f"notify-class-{suffix}",
                "course_name": f"通知沙龙_{suffix}",
                "teacher_ids": [customer_id],
            },
            "通知沙龙",
            "老师",
        ),
        (
            "/api/group-case-sessions",
            {
                "date": date,
                "name": f"通知觉醒_{suffix}",
                "owner_id": customer_id,
                "owner_name": nickname,
            },
            "通知觉醒",
            "案主",
        ),
        (
            "/api/emotional-release-sessions",
            {
                "date": date,
                "name": f"通知情绪_{suffix}",
                "owner_id": customer_id,
                "owner_name": nickname,
            },
            "通知情绪",
            "案主",
        ),
        (
            "/api/energy-knot-sessions",
            {
                "date": date,
                "name": f"通知能量结_{suffix}",
                "owner_id": customer_id,
                "owner_name": nickname,
            },
            "通知能量结",
            "案主",
        ),
        (
            "/api/internal-course-sessions",
            {
                "date": date,
                "course_type": "疗愈师课程",
                "course_name": f"通知内部课_{suffix}",
                "teacher_ids": [customer_id],
            },
            "通知内部课",
            "老师",
        ),
    ]
    created = []

    try:
        for endpoint, payload, _, _ in activity_specs:
            response = client.post(endpoint, json=payload)
            assert response.status_code == 200
            created.append((endpoint, response.json()["id"]))

        response = client.get(
            "/api/client/notifications",
            headers=_customer_headers(created_customer),
        )
        assert response.status_code == 200
        assignment_items = [
            item
            for item in response.json()["items"]
            if item["type"] == "activity_assigned"
        ]

        for _, _, name_prefix, role in activity_specs:
            item = next(
                item
                for item in assignment_items
                if item["activity_name"].startswith(name_prefix)
            )
            assert f"活动名称：{item['activity_name']}" in item["content"]
            assert f"身份：{role}" in item["content"]
            assert "活动暂未发布" in item["content"]
    finally:
        for endpoint, activity_id in created:
            client.delete(f"{endpoint}/{activity_id}")


def test_client_signup_creates_activity_arrangement_notification(
    client,
    created_customer,
):
    suffix = uuid.uuid4().hex[:8]
    activity_response = client.post("/api/class-records", json={
        "date": "2026-12-30",
        "start_time": "19:00",
        "end_time": "21:00",
        "course_id": f"signup-notify-{suffix}",
        "course_name": f"自主报名活动_{suffix}",
        "is_published": True,
    })
    assert activity_response.status_code == 200
    activity = activity_response.json()
    headers = _customer_headers(created_customer)

    try:
        signup_response = client.post(
            f"/api/client/activities/{activity['id']}/signup",
            headers=headers,
        )
        assert signup_response.status_code == 200

        response = client.get("/api/client/notifications", headers=headers)
        assert response.status_code == 200
        notification = next(
            item
            for item in response.json()["items"]
            if item["type"] == "activity_assigned"
            and item["activity_name"] == activity["course_name"]
        )
        assert notification["title"] == "活动安排"
        assert f"活动名称：{activity['course_name']}" in notification["content"]
        assert "活动时间：19:00-21:00" in notification["content"]
        assert "身份：参与者" in notification["content"]
        assert notification["activity_date"] == "2026-12-30"
    finally:
        client.post(
            f"/api/client/activities/{activity['id']}/cancel-signup",
            headers=headers,
        )
        client.delete(f"/api/class-records/{activity['id']}")


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
