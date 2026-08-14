import uuid

from app.services import position_permission_service


def _create_account(client, suffix: str):
    password = f"tag{suffix}9"
    response = client.post("/api/accounts", json={
        "owner": f"标签用户_{suffix}",
        "role": "管理员",
        "username": f"tag_user_{suffix}",
        "password": password,
        "enabled": True,
    })
    assert response.status_code == 200, response.text
    account = response.json()
    login = client.post("/api/accounts/login", json={
        "username": account["username"],
        "password": password,
    })
    assert login.status_code == 200
    assert login.json()["success"] is True
    return account, {"Authorization": f"Bearer {login.json()['token']}"}


def test_customer_tags_keep_private_tags_isolated_and_filter_customers(client, created_customer):
    suffix = uuid.uuid4().hex[:10]
    previous_permissions = position_permission_service.get_permissions("管理员")
    account_ids: list[str] = []
    public_tag_id = ""
    private_tag_id = ""
    first_headers: dict[str, str] = {}
    try:
        position_permission_service.set_permissions("管理员", ["healing-records"])
        first, first_headers = _create_account(client, suffix + "a")
        second, second_headers = _create_account(client, suffix + "b")
        account_ids.extend([first["id"], second["id"]])

        customer_update = client.patch(f"/api/customers/{created_customer['id']}", json={
            "referral_date": "2026-08-09",
            "referrer": f"引流人_{suffix}",
        })
        assert customer_update.status_code == 200, customer_update.text

        public_response = client.post("/api/customer-tags", json={
            "name": f"公共标签_{suffix}",
            "scope": "public",
            "description": "团队共享",
        })
        assert public_response.status_code == 200, public_response.text
        public_tag_id = public_response.json()["id"]

        private_response = client.post("/api/customer-tags", headers=first_headers, json={
            "name": f"私有标签_{suffix}",
            "scope": "private",
            "description": "仅创建人可见",
        })
        assert private_response.status_code == 200, private_response.text
        private_tag_id = private_response.json()["id"]

        assign_response = client.put(
            f"/api/customer-tags/customers/{created_customer['id']}",
            headers=first_headers,
            json={"tag_ids": [public_tag_id, private_tag_id]},
        )
        assert assign_response.status_code == 200, assign_response.text

        second_list = client.get("/api/customer-tags", headers=second_headers)
        assert second_list.status_code == 200
        assert {tag["id"] for tag in second_list.json()} == {public_tag_id}

        second_customer_tags = client.get(
            f"/api/customer-tags/customers/{created_customer['id']}",
            headers=second_headers,
        )
        assert [tag["id"] for tag in second_customer_tags.json()] == [public_tag_id]

        # 他人修改公共标签时，不会误删创建人的私有标签。
        replace_response = client.put(
            f"/api/customer-tags/customers/{created_customer['id']}",
            headers=second_headers,
            json={"tag_ids": [public_tag_id]},
        )
        assert replace_response.status_code == 200
        first_customer_tags = client.get(
            f"/api/customer-tags/customers/{created_customer['id']}",
            headers=first_headers,
        )
        assert {tag["id"] for tag in first_customer_tags.json()} == {public_tag_id, private_tag_id}

        filtered = client.get(
            "/api/customers",
            headers=second_headers,
            params={"tag_ids": public_tag_id, "page": 1, "page_size": 10},
        )
        assert filtered.status_code == 200, filtered.text
        assert created_customer["id"] in {item["id"] for item in filtered.json()["items"]}

        referral_statistics = client.get(
            "/api/statistics/referrals",
            headers=second_headers,
            params={
                "date_from": "2026-08-01",
                "date_to": "2026-08-31",
                "tag_ids": public_tag_id,
            },
        )
        assert referral_statistics.status_code == 200, referral_statistics.text
        assert {item["id"] for item in referral_statistics.json()["members"]} == {created_customer["id"]}

        hidden_filter = client.get(
            "/api/customers",
            headers=second_headers,
            params={"tag_ids": private_tag_id, "page": 1, "page_size": 10},
        )
        assert hidden_filter.status_code == 403

        hidden_referral_statistics = client.get(
            "/api/statistics/referrals",
            headers=second_headers,
            params={
                "date_from": "2026-08-01",
                "date_to": "2026-08-31",
                "tag_ids": private_tag_id,
            },
        )
        assert hidden_referral_statistics.status_code == 403
    finally:
        position_permission_service.set_permissions("管理员", previous_permissions)
        if private_tag_id and first_headers:
            client.delete(f"/api/customer-tags/{private_tag_id}", headers=first_headers)
        if public_tag_id:
            client.delete(f"/api/customer-tags/{public_tag_id}")
        for account_id in account_ids:
            client.delete(f"/api/accounts/{account_id}")


def test_customer_tag_operation_logs_show_names_changes_and_miniprogram_source(client, created_customer):
    suffix = uuid.uuid4().hex[:10]
    public_tag_id = ""
    private_tag_id = ""
    try:
        public_response = client.post("/api/customer-tags", json={
            "name": f"重点客户_{suffix}",
            "scope": "public",
            "description": "团队重点跟进",
        })
        assert public_response.status_code == 200, public_response.text
        public_tag_id = public_response.json()["id"]

        private_response = client.post("/api/customer-tags", json={
            "name": f"我的客户_{suffix}",
            "scope": "private",
            "description": "个人跟进",
        })
        assert private_response.status_code == 200, private_response.text
        private_tag_id = private_response.json()["id"]

        create_logs = client.get(
            "/api/operation-logs",
            params={"entity_id": public_tag_id, "section": "客户标签"},
        ).json()
        assert create_logs
        assert f"重点客户_{suffix}" in create_logs[0]["content"]
        assert "团队共享" in create_logs[0]["content"]
        assert create_logs[0]["after_data"]["scope"] == "public"

        updated_public_name = f"重点会员_{suffix}"
        update_response = client.put(f"/api/customer-tags/{public_tag_id}", json={
            "name": updated_public_name,
            "description": "改为重点维护",
        })
        assert update_response.status_code == 200, update_response.text
        update_logs = client.get(
            "/api/operation-logs",
            params={"entity_id": public_tag_id, "section": "客户标签"},
        ).json()
        update_log = update_logs[0]
        assert update_log["method"] == "PUT"
        assert f"重点客户_{suffix}" in update_log["content"]
        assert updated_public_name in update_log["content"]
        assert update_log["before_data"]["name"] == f"重点客户_{suffix}"
        assert update_log["after_data"]["name"] == updated_public_name

        assign_response = client.put(
            f"/api/customer-tags/customers/{created_customer['id']}",
            headers={"X-Client-Type": "miniprogram"},
            json={"tag_ids": [public_tag_id, private_tag_id]},
        )
        assert assign_response.status_code == 200, assign_response.text

        assignment_logs = client.get(
            "/api/operation-logs",
            params={"entity_id": created_customer["id"], "section": "客户标签"},
        ).json()
        assert assignment_logs
        assignment_log = assignment_logs[0]
        assert assignment_log["source"] == "miniprogram"
        assert created_customer["nickname"] in assignment_log["content"]
        assert updated_public_name in assignment_log["content"]
        assert f"我的客户_{suffix}" in assignment_log["content"]
        assert assignment_log["before_data"]["customer_tags"] == []
        assert set(assignment_log["after_data"]["customer_tags"]) == {
            updated_public_name,
            f"我的客户_{suffix}",
        }
        assert "customers" not in assignment_log["entity_id"]

        remove_response = client.put(
            f"/api/customer-tags/customers/{created_customer['id']}",
            headers={"X-Client-Type": "miniprogram"},
            json={"tag_ids": [public_tag_id]},
        )
        assert remove_response.status_code == 200, remove_response.text
        remove_log = client.get(
            "/api/operation-logs",
            params={"entity_id": created_customer["id"], "section": "客户标签"},
        ).json()[0]
        assert f"移除标签“我的客户_{suffix}”" in remove_log["content"]
        assert remove_log["source"] == "miniprogram"
        assert remove_log["after_data"]["customer_tags"] == [updated_public_name]

        logs_before_noop = client.get(
            "/api/operation-logs",
            params={"entity_id": created_customer["id"], "section": "客户标签"},
        ).json()
        noop_response = client.put(
            f"/api/customer-tags/customers/{created_customer['id']}",
            json={"tag_ids": [public_tag_id]},
        )
        assert noop_response.status_code == 200, noop_response.text
        logs_after_noop = client.get(
            "/api/operation-logs",
            params={"entity_id": created_customer["id"], "section": "客户标签"},
        ).json()
        assert len(logs_after_noop) == len(logs_before_noop)

        delete_response = client.delete(f"/api/customer-tags/{private_tag_id}")
        assert delete_response.status_code == 200, delete_response.text
        delete_log = client.get(
            "/api/operation-logs",
            params={"entity_id": private_tag_id, "section": "客户标签"},
        ).json()[0]
        assert delete_log["method"] == "DELETE"
        assert f"停用客户标签“我的客户_{suffix}”" in delete_log["content"]
        assert delete_log["before_data"]["enabled"] is True
        assert delete_log["after_data"]["enabled"] is False
        private_tag_id = ""
    finally:
        if private_tag_id:
            client.delete(f"/api/customer-tags/{private_tag_id}")
        if public_tag_id:
            client.delete(f"/api/customer-tags/{public_tag_id}")
