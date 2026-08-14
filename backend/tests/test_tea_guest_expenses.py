import uuid

from app.services import position_permission_service


def test_tea_guest_expense_crud_types_and_logs(client):
    suffix = uuid.uuid4().hex[:10]
    type_name = f"物料_{suffix}"
    type_response = client.post("/api/tea-guest/expenses/types", json={
        "cost_category": "operation",
        "name": type_name,
        "requires_platform": True,
    })
    assert type_response.status_code == 200
    expense_type = type_response.json()

    missing_platform = client.post("/api/tea-guest/expenses", json={
        "cost_category": "operation",
        "expense_type": type_name,
        "expense_time": "2026-08-14T14:00",
        "purchase_content": "茶具",
        "amount": 128.5,
        "platform": "",
        "notes": "",
    })
    assert missing_platform.status_code == 400
    assert missing_platform.json()["detail"] == "请输入平台"

    create_response = client.post("/api/tea-guest/expenses", json={
        "cost_category": "operation",
        "expense_type": type_name,
        "expense_time": "2026-08-14T14:00",
        "purchase_content": "茶具",
        "amount": 128.5,
        "platform": "美团",
        "notes": "独立支出",
    })
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["created_by"] == "不闹"

    listed = client.get(
        "/api/tea-guest/expenses",
        params={"date_from": "2026-08-14", "date_to": "2026-08-14", "cost_category": "operation"},
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == created["id"]

    logs = client.get(
        "/api/operation-logs",
        params={"entity_id": created["id"], "section": "茶客业务 · 支出"},
    ).json()
    assert logs
    assert "支出项：茶具" in logs[0]["content"]
    assert "金额：¥128.50" in logs[0]["content"]

    update_response = client.put(f"/api/tea-guest/expenses/{created['id']}", json={
        "cost_category": "operation",
        "expense_type": type_name,
        "expense_time": "2026-08-14T15:00",
        "purchase_content": "茶具补充",
        "amount": 150,
        "platform": "微信",
        "notes": "已更新",
    })
    assert update_response.status_code == 200
    assert update_response.json()["amount"] == 150

    assert client.delete(f"/api/tea-guest/expenses/{created['id']}").status_code == 200
    assert client.get(f"/api/tea-guest/expenses/{created['id']}").status_code == 404
    assert client.delete(f"/api/tea-guest/expenses/types/{expense_type['id']}").status_code == 200


def test_tea_guest_expenses_require_separate_permission(client):
    suffix = uuid.uuid4().hex[:10]
    role = "管理员"
    previous_permissions = position_permission_service.get_permissions(role)
    account_id = ""
    try:
        position_permission_service.set_permissions(
            role,
            [page for page in previous_permissions if page != "tea-guest-expenses"],
        )
        create_account = client.post("/api/accounts", json={
            "owner": f"茶客支出_{suffix}",
            "role": role,
            "username": f"tea_expense_{suffix}",
            "password": f"tea{suffix}9",
            "enabled": True,
        })
        assert create_account.status_code == 200
        account_id = create_account.json()["id"]
        login = client.post("/api/accounts/login", json={
            "username": f"tea_expense_{suffix}",
            "password": f"tea{suffix}9",
        })
        headers = {"Authorization": f"Bearer {login.json()['token']}"}

        assert client.get("/api/tea-guest/expenses", headers=headers).status_code == 403
        position_permission_service.set_permissions(
            role,
            sorted(set(previous_permissions) | {"tea-guest-expenses"}),
        )
        assert client.get("/api/tea-guest/expenses", headers=headers).status_code == 200
    finally:
        position_permission_service.set_permissions(role, previous_permissions)
        if account_id:
            client.delete(f"/api/accounts/{account_id}")
