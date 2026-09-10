def test_expense_crud_and_pagination(client):
    expense_id = ""
    try:
        create_response = client.post("/api/expenses", json={
            "cost_category": "management",
            "expense_type": "物资采购",
            "expense_time": "2026-08-09T14:30",
            "purchase_content": "采购茶具",
            "amount": 368.5,
            "platform": "京东",
            "notes": "前台日常使用",
        })
        assert create_response.status_code == 200
        created = create_response.json()
        expense_id = created["id"]
        assert created["purchase_content"] == "采购茶具"
        assert created["amount"] == 368.5
        assert created["created_by"] == "不闹"

        list_response = client.get("/api/expenses", params={"page": 1, "page_size": 20})
        assert list_response.status_code == 200
        page = list_response.json()
        assert page["total"] >= 1
        assert any(item["id"] == expense_id for item in page["items"])

        matched_response = client.get("/api/expenses", params={
            "date_from": "2026-08-09",
            "date_to": "2026-08-09",
            "page": 1,
            "page_size": 20,
        })
        assert matched_response.status_code == 200
        assert any(item["id"] == expense_id for item in matched_response.json()["items"])

        unmatched_response = client.get("/api/expenses", params={
            "date_from": "2026-08-10",
            "date_to": "2026-08-10",
            "page": 1,
            "page_size": 20,
        })
        assert unmatched_response.status_code == 200
        assert all(item["id"] != expense_id for item in unmatched_response.json()["items"])

        update_response = client.put(f"/api/expenses/{expense_id}", json={
            "cost_category": "operation",
            "expense_type": "平台服务",
            "expense_time": "2026-08-09T15:00",
            "purchase_content": "采购茶具和托盘",
            "amount": 428.5,
            "platform": "京东",
            "notes": "已补充托盘",
        })
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["expense_time"] == "2026-08-09T15:00"
        assert updated["purchase_content"] == "采购茶具和托盘"
        assert updated["amount"] == 428.5

        delete_response = client.delete(f"/api/expenses/{expense_id}")
        assert delete_response.status_code == 200

        detail_response = client.get(f"/api/expenses/{expense_id}")
        assert detail_response.status_code == 404
        expense_id = ""
    finally:
        if expense_id:
            client.delete(f"/api/expenses/{expense_id}")


def test_expense_rejects_invalid_amount(client):
    response = client.post("/api/expenses", json={
        "cost_category": "management",
        "expense_type": "无效类型",
        "expense_time": "2026-08-09T14:30",
        "purchase_content": "无效支出",
        "amount": 0,
        "platform": "线下",
        "notes": "",
    })
    assert response.status_code == 422


def test_expense_type_controls_customer_and_platform_fields(client, created_customer):
    type_id = ""
    expense_id = ""
    try:
        type_response = client.post("/api/expenses/types", json={
            "cost_category": "operation",
            "name": "人员分成测试",
            "requires_customer": True,
            "requires_platform": False,
        })
        assert type_response.status_code == 200, type_response.text
        expense_type = type_response.json()
        type_id = expense_type["id"]
        assert expense_type["requires_customer"] is True
        assert expense_type["requires_platform"] is False

        missing_customer = client.post("/api/expenses", json={
            "cost_category": "operation",
            "expense_type": "人员分成测试",
            "expense_time": "2026-08-14T09:00",
            "purchase_content": "八月人员分成",
            "amount": 500,
            "platform": "",
            "notes": "测试",
        })
        assert missing_customer.status_code == 400
        assert missing_customer.json()["detail"] == "请选择用户昵称"

        create_response = client.post("/api/expenses", json={
            "cost_category": "operation",
            "expense_type": "人员分成测试",
            "expense_time": "2026-08-14T09:00",
            "purchase_content": "八月人员分成",
            "amount": 500,
            "customer_id": created_customer["id"],
            "customer_nickname": "不应信任的昵称",
            "platform": "",
            "notes": "测试",
        })
        assert create_response.status_code == 200, create_response.text
        created = create_response.json()
        expense_id = created["id"]
        assert created["customer_nickname"] == created_customer["nickname"]
        assert created["platform"] == ""

        update_type_response = client.put(f"/api/expenses/types/{type_id}", json={
            "requires_customer": True,
            "requires_platform": True,
        })
        assert update_type_response.status_code == 200, update_type_response.text
        assert update_type_response.json()["requires_platform"] is True

        missing_platform = client.put(f"/api/expenses/{expense_id}", json={
            "cost_category": "operation",
            "expense_type": "人员分成测试",
            "expense_time": "2026-08-14T09:00",
            "purchase_content": "八月人员分成",
            "amount": 500,
            "customer_id": created_customer["id"],
            "customer_nickname": created_customer["nickname"],
            "platform": "",
            "notes": "测试",
        })
        assert missing_platform.status_code == 400
        assert missing_platform.json()["detail"] == "请输入平台"
    finally:
        if expense_id:
            client.delete(f"/api/expenses/{expense_id}")
        if type_id:
            client.delete(f"/api/expenses/types/{type_id}")
