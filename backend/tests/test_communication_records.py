"""沟通记录入口、删除权限与操作日志测试。"""

import uuid


def test_only_creator_can_delete_and_log_keeps_snapshot(client, created_customer):
    content = f"测试沟通内容_{uuid.uuid4().hex[:8]}"
    created = client.post("/api/communication-records", json={
        "customer_nickname": created_customer["nickname"],
        "content": content,
    })
    assert created.status_code == 200
    record = created.json()
    assert record["can_edit"] is True
    assert record["can_delete"] is True
    assert record["creator_id"]

    create_logs = client.get("/api/operation-logs", params={
        "method": "POST",
        "entity_id": record["id"],
    })
    assert create_logs.status_code == 200
    create_log = create_logs.json()[0]
    assert create_log["content"] == (
        f"新增沟通记录：客户：{created_customer['nickname']}｜内容：{content}"
    )
    assert create_log["after_data"]["content"] == content
    assert create_log["after_data"]["creator_id"] == record["creator_id"]

    suffix = uuid.uuid4().hex[:10]
    password = f"pw{suffix}9"
    account_response = client.post("/api/accounts", json={
        "owner": f"其他创建人_{suffix}",
        "role": "超级管理员",
        "username": f"communication_{suffix}",
        "password": password,
        "enabled": True,
    })
    assert account_response.status_code == 200
    account = account_response.json()

    try:
        login = client.post("/api/accounts/login", json={
            "username": account["username"],
            "password": password,
        })
        assert login.status_code == 200
        other_headers = {"Authorization": f"Bearer {login.json()['token']}"}

        listed = client.get(
            "/api/communication-records",
            params={"customer_nickname": created_customer["nickname"]},
            headers=other_headers,
        )
        other_record = next(item for item in listed.json() if item["id"] == record["id"])
        assert other_record["can_edit"] is False
        assert other_record["can_delete"] is False

        forbidden_update = client.put(
            f"/api/communication-records/{record['id']}",
            json={
                "customer_nickname": created_customer["nickname"],
                "content": "试图修改他人的记录",
            },
            headers=other_headers,
        )
        assert forbidden_update.status_code == 403
        assert forbidden_update.json()["detail"] == "只能修改自己新增的沟通记录"

        forbidden = client.delete(
            f"/api/communication-records/{record['id']}",
            headers=other_headers,
        )
        assert forbidden.status_code == 403
        assert forbidden.json()["detail"] == "只能删除自己新增的沟通记录"

        updated_content = content + "_本人已修改"
        updated = client.put(f"/api/communication-records/{record['id']}", json={
            "customer_nickname": created_customer["nickname"],
            "content": updated_content,
        })
        assert updated.status_code == 200
        assert updated.json()["content"] == updated_content
        assert updated.json()["can_edit"] is True

        update_logs = client.get("/api/operation-logs", params={
            "method": "UPDATE",
            "entity_id": record["id"],
        })
        assert update_logs.status_code == 200
        update_log = update_logs.json()[0]
        assert update_log["content"] == (
            f"修改沟通记录：客户：{created_customer['nickname']}｜内容："
            f"{content} → {updated_content}"
        )
        assert update_log["before_data"]["content"] == content
        assert update_log["after_data"]["content"] == updated_content

        deleted = client.delete(
            f"/api/communication-records/{record['id']}",
            headers={"X-Client-Type": "miniprogram"},
        )
        assert deleted.status_code == 200

        logs = client.get("/api/operation-logs", params={
            "method": "DELETE",
            "entity_id": record["id"],
        })
        assert logs.status_code == 200
        delete_log = logs.json()[0]
        assert delete_log["section"] == "沟通记录"
        assert delete_log["source"] == "miniprogram"
        assert delete_log["content"] == (
            f"删除沟通记录：客户：{created_customer['nickname']}｜内容：{updated_content}"
        )
        assert delete_log["before_data"]["customer_nickname"] == created_customer["nickname"]
        assert delete_log["before_data"]["content"] == updated_content
        assert delete_log["before_data"]["creator"] == record["creator"]
        assert delete_log["before_data"]["creator_id"] == record["creator_id"]
        assert delete_log["before_data"]["created_at"] == record["created_at"]
    finally:
        client.delete(f"/api/accounts/{account['id']}")
