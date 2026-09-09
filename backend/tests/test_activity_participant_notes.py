def test_course_participant_notes_work_without_visit_record(client, created_customer):
    course = client.post(
        "/api/class-records",
        json={
            "date": "2026-09-08",
            "start_time": "10:00",
            "end_time": "11:30",
            "course_id": "participant-note-test",
            "course_name": "参与人记录测试课",
            "course_type": "沙龙",
            "participant_ids": [created_customer["id"]],
        },
    )
    assert course.status_code == 200, course.text
    course_id = course.json()["id"]
    note_ids = []
    try:
        for category, content in (
            ("customer_info", "今天表达比之前更放松"),
            ("follow_up", "三天后确认睡眠情况"),
        ):
            response = client.post(
                "/api/class-records/participant-notes",
                json={
                    "activity_source": "class_record",
                    "session_id": course_id,
                    "customer_id": created_customer["id"],
                    "category": category,
                    "content": content,
                },
            )
            assert response.status_code == 200, response.text
            note_ids.append(response.json()["id"])

        listed = client.get(
            "/api/class-records/participant-notes/list",
            params={
                "activity_source": "class_record",
                "session_id": course_id,
                "customer_ids": created_customer["id"],
            },
        )
        assert listed.status_code == 200, listed.text
        assert {
            (item["category"], item["content"])
            for item in listed.json()
        } == {
            ("customer_info", "今天表达比之前更放松"),
            ("follow_up", "三天后确认睡眠情况"),
        }
        assert all(item["can_edit"] is True for item in listed.json())

        dashboard = client.get(
            "/api/class-records/dashboard",
            params={"date": "2026-09-08"},
        )
        assert dashboard.status_code == 200, dashboard.text
        dashboard_course = next(
            item
            for item in dashboard.json()["class_records"]
            if item["id"] == course_id
        )
        assert dashboard_course["participant_note_total_count"] == 1
        assert dashboard_course["participant_note_completed_count"] == 1

        detail = client.get(f"/api/customer-detail/{created_customer['id']}")
        assert detail.status_code == 200, detail.text
        course_notes = [
            item
            for item in detail.json()["activity_participant_notes"]
            if item["session_id"] == course_id
        ]
        assert len(course_notes) == 2
        assert all(item["activity_name"] == "参与人记录测试课" for item in course_notes)
    finally:
        for note_id in note_ids:
            client.delete(f"/api/class-records/participant-notes/{note_id}")
        client.delete(f"/api/class-records/{course_id}")
