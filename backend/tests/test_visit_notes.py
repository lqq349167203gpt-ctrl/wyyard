import uuid


def _create_other_headers(client):
    suffix = uuid.uuid4().hex[:10]
    password = f"pw{suffix}9"
    account_response = client.post(
        "/api/accounts",
        json={
            "owner": f"协作员工_{suffix}",
            "role": "超级管理员",
            "username": f"visit_note_{suffix}",
            "password": password,
            "enabled": True,
        },
    )
    assert account_response.status_code == 200
    account = account_response.json()
    login_response = client.post(
        "/api/accounts/login",
        json={"username": account["username"], "password": password},
    )
    assert login_response.status_code == 200
    return account, {"Authorization": f"Bearer {login_response.json()['token']}"}


def _create_visit(client, customer_id: str, **extra):
    payload = {
        "visit_date": "2026-08-23",
        "visit_time": "09:00",
        "customer_id": customer_id,
        **extra,
    }
    response = client.post("/api/visits", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_visit_notes_are_collaborative_but_only_creator_can_manage(
    client, created_customer
):
    visit = _create_visit(client, created_customer["id"])
    account, other_headers = _create_other_headers(client)
    created_note_ids = []
    try:
        first_response = client.post(
            "/api/visit-notes",
            json={
                "visit_id": visit["id"],
                "category": "customer_info",
                "content": "客户最近睡眠不稳定",
            },
        )
        assert first_response.status_code == 200, first_response.text
        first = first_response.json()
        created_note_ids.append(first["id"])
        assert first["created_by"] == "不闹"
        assert first["can_edit"] is True
        create_logs = client.get(
            "/api/operation-logs",
            params={"entity_id": first["id"], "method": "POST"},
        ).json()
        assert create_logs
        assert "新增客户信息" in create_logs[0]["content"]
        assert "日期：2026-08-23" in create_logs[0]["content"]
        assert "客户最近睡眠不稳定" in create_logs[0]["content"]
        assert create_logs[0]["after_data"]["category_label"] == "客户信息"
        assert create_logs[0]["after_data"]["visit_date"] == "2026-08-23"
        assert create_logs[0]["after_data"]["customer_nickname"] == created_customer["nickname"]

        other_list = client.get(
            f"/api/visit-notes?visit_id={visit['id']}", headers=other_headers
        )
        assert other_list.status_code == 200
        other_view = next(item for item in other_list.json() if item["id"] == first["id"])
        assert other_view["can_edit"] is False
        assert other_view["can_delete"] is False

        forbidden_update = client.patch(
            f"/api/visit-notes/{first['id']}",
            json={"content": "不允许覆盖别人的内容"},
            headers=other_headers,
        )
        assert forbidden_update.status_code == 403
        forbidden_delete = client.delete(
            f"/api/visit-notes/{first['id']}", headers=other_headers
        )
        assert forbidden_delete.status_code == 403

        second_response = client.post(
            "/api/visit-notes",
            json={
                "visit_id": visit["id"],
                "category": "customer_info",
                "content": "已建议先观察一周",
            },
            headers=other_headers,
        )
        assert second_response.status_code == 200, second_response.text
        second = second_response.json()
        created_note_ids.append(second["id"])
        assert second["created_by"] == account["owner"]
        assert second["can_edit"] is True

        update_second = client.patch(
            f"/api/visit-notes/{second['id']}",
            json={"content": "已建议观察一周并记录睡眠"},
            headers=other_headers,
        )
        assert update_second.status_code == 200

        visit_response = client.get(f"/api/visits/{visit['id']}")
        assert visit_response.status_code == 200
        aggregate = visit_response.json()["feedback"]
        assert "不闹：客户最近睡眠不稳定" in aggregate
        assert f"{account['owner']}：已建议观察一周并记录睡眠" in aggregate

        detail_response = client.get(f"/api/customer-detail/{created_customer['id']}")
        assert detail_response.status_code == 200
        detail_visit = next(
            item
            for item in detail_response.json()["visit_records"]
            if item["id"] == visit["id"]
        )
        assert {
            (item["created_by"], item["category"], item["content"])
            for item in detail_visit["visit_notes"]
        } == {
            ("不闹", "customer_info", "客户最近睡眠不稳定"),
            (
                account["owner"],
                "customer_info",
                "已建议观察一周并记录睡眠",
            ),
        }

        delete_second = client.delete(
            f"/api/visit-notes/{second['id']}", headers=other_headers
        )
        assert delete_second.status_code == 200
        delete_logs = client.get(
            "/api/operation-logs",
            params={"entity_id": second["id"], "method": "DELETE"},
        ).json()
        assert delete_logs
        assert "删除客户信息" in delete_logs[0]["content"]
        assert "日期：2026-08-23" in delete_logs[0]["content"]
        assert "已建议观察一周并记录睡眠" in delete_logs[0]["before_data"]["content"]
        remaining = client.get(f"/api/visit-notes?visit_id={visit['id']}").json()
        assert [item["id"] for item in remaining] == [first["id"]]
    finally:
        for note_id in created_note_ids:
            client.delete(f"/api/visit-notes/{note_id}")
        client.delete(f"/api/visits/{visit['id']}")
        client.delete(f"/api/accounts/{account['id']}")


def test_visit_note_list_migrates_legacy_fields(client, created_customer):
    visit = _create_visit(
        client,
        created_customer["id"],
        feedback="原客户信息",
        healing_notes="原跟进点",
    )
    try:
        response = client.get(f"/api/visit-notes?visit_id={visit['id']}")
        assert response.status_code == 200
        notes = response.json()
        assert {(item["category"], item["content"]) for item in notes} == {
            ("customer_info", "原客户信息"),
            ("follow_up", "原跟进点"),
        }
        assert all(item["created_by"] == "不闹" for item in notes)
    finally:
        client.delete(f"/api/visits/{visit['id']}")


def test_visit_note_create_upserts_same_creator(client, created_customer):
    visit = _create_visit(client, created_customer["id"])
    note_id = ""
    try:
        first_response = client.post(
            "/api/visit-notes",
            json={
                "visit_id": visit["id"],
                "category": "follow_up",
                "content": "先电话回访",
            },
        )
        assert first_response.status_code == 200
        first = first_response.json()
        note_id = first["id"]

        second_response = client.post(
            "/api/visit-notes",
            json={
                "visit_id": visit["id"],
                "category": "follow_up",
                "content": "周五前电话回访",
            },
        )
        assert second_response.status_code == 200
        second = second_response.json()

        assert second["id"] == first["id"]
        notes = client.get(f"/api/visit-notes?visit_id={visit['id']}").json()
        follow_up_notes = [item for item in notes if item["category"] == "follow_up"]
        assert len(follow_up_notes) == 1
        assert follow_up_notes[0]["content"] == "周五前电话回访"
    finally:
        if note_id:
            client.delete(f"/api/visit-notes/{note_id}")
        client.delete(f"/api/visits/{visit['id']}")
