import uuid

from app.services import position_permission_service


def test_tea_guest_consumption_crud_and_server_total(client):
    payload = {
        "consumption_time": "2026-08-14T10:30",
        "guest_count": 3,
        "unit_price": 19.9,
        "payment_method": "微信",
        "notes": "测试消费",
    }

    create_response = client.post("/api/tea-guest/consumption-records", json=payload)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["total_amount"] == 59.7
    assert created["created_by"] == "不闹"
    logs = client.get(
        "/api/operation-logs",
        params={"entity_id": created["id"], "section": "茶客业务 · 消费记录"},
    ).json()
    assert logs
    assert "茶客数量：3人" in logs[0]["content"]
    assert "总金额：¥59.70" in logs[0]["content"]

    list_response = client.get(
        "/api/tea-guest/consumption-records",
        params={
            "date_from": "2026-08-14",
            "date_to": "2026-08-14",
            "payment_method": "微信",
            "page": 1,
            "page_size": 20,
        },
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == created["id"]

    update_response = client.put(
        f"/api/tea-guest/consumption-records/{created['id']}",
        json={
            **payload,
            "guest_count": 2,
            "unit_price": 25.55,
            "payment_method": "支付宝",
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["total_amount"] == 51.1
    assert updated["payment_method"] == "支付宝"

    delete_response = client.delete(f"/api/tea-guest/consumption-records/{created['id']}")
    assert delete_response.status_code == 200
    assert client.get(f"/api/tea-guest/consumption-records/{created['id']}").status_code == 404


def test_tea_guest_consumption_rejects_invalid_payment_and_time(client):
    response = client.post(
        "/api/tea-guest/consumption-records",
        json={
            "consumption_time": "not-a-time",
            "guest_count": 1,
            "unit_price": 10,
            "payment_method": "现金",
            "notes": "",
        },
    )
    assert response.status_code == 422


def test_tea_guest_consumption_requires_page_permission(client):
    suffix = uuid.uuid4().hex[:10]
    role = "管理员"
    previous_permissions = position_permission_service.get_permissions(role)
    account_id = ""
    try:
        position_permission_service.set_permissions(
            role,
            [page for page in previous_permissions if page != "tea-guest-consumption-records"],
        )
        create_account = client.post("/api/accounts", json={
            "owner": f"茶客测试_{suffix}",
            "role": role,
            "username": f"tea_guest_{suffix}",
            "password": f"tea{suffix}9",
            "enabled": True,
        })
        assert create_account.status_code == 200
        account_id = create_account.json()["id"]
        login = client.post("/api/accounts/login", json={
            "username": f"tea_guest_{suffix}",
            "password": f"tea{suffix}9",
        })
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['token']}"}

        denied = client.get("/api/tea-guest/consumption-records", headers=headers)
        assert denied.status_code == 403

        position_permission_service.set_permissions(
            role,
            sorted(set(previous_permissions) | {"tea-guest-consumption-records"}),
        )
        allowed = client.get("/api/tea-guest/consumption-records", headers=headers)
        assert allowed.status_code == 200
    finally:
        position_permission_service.set_permissions(role, previous_permissions)
        if account_id:
            client.delete(f"/api/accounts/{account_id}")
