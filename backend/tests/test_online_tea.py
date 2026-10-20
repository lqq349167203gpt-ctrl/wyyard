from app.services import online_tea_service


def test_online_tea_crud_expiry_no_amount_and_reporting(client, created_customer):
    org = client.post(
        "/api/organizations", json={"name": "线上茶疗测试", "member_ids": [created_customer["id"]]}
    ).json()
    payload = {
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "organization_id": org["id"],
        "deal_date": "2026-01-30",
        "effective_date": "2026-01-31",
        "deal_course_key": "",
        "deal_course_name": "",
        "closers": [{"id": "closer", "name": "测试成交人", "amount": 999}],
        "notes": "仅登记购买",
    }
    result = client.post("/api/online-tea", json=payload)
    assert result.status_code == 200, result.text
    item = result.json()
    record_id = item["id"]
    assert item["validity_value"] == 1 and item["validity_unit"] == "month" and item["expiry_date"] == "2026-02-27"
    assert item["closers"][0]["amount"] == 0
    assert item["amount_recorded"] is False and "amount" not in item and "price" not in item
    assert client.get(f"/api/online-tea/{record_id}").status_code == 200
    page = client.get(
        "/api/online-tea", params={"page": 1, "page_size": 20, "customer_ids": created_customer["id"]}
    ).json()
    assert page["total"] == 1 and page["items"][0]["notes"] == "仅登记购买"
    result = client.patch(f"/api/online-tea/{record_id}", json={"validity_value": 2})
    assert result.status_code == 200 and result.json()["expiry_date"] == "2026-03-30"
    result = client.patch(f"/api/online-tea/{record_id}", json={"validity_value": 2, "validity_unit": "day"})
    assert result.status_code == 200 and result.json()["expiry_date"] == "2026-02-01"
    assert client.patch(f"/api/online-tea/{record_id}", json={"validity_value": 0}).status_code == 400
    assert client.patch(f"/api/online-tea/{record_id}", json={"validity_unit": "week"}).status_code == 400
    assert online_tea_service.get_record(record_id).validity_value == 2
    detail = client.get(f"/api/customer-detail/{created_customer['id']}").json()
    assert any(row["type"] == "线上茶疗" and row["validity_unit"] == "day" for row in detail["purchase_summary"])
    assert any(row["type"] == "线上茶疗" and row["quantity"] == "2天" and row["amount"] is None for row in detail["payment_records"])
    query = client.post(
        "/api/principal/query",
        json={"tab": "orders", "organization_id": org["id"], "date_from": "2026-01-01", "date_to": "2026-12-31"},
    ).json()
    assert any(row.get("product") == "online_tea" for row in query["items"])
    from app.services import payment_export_service

    exported = payment_export_service._build_rows("超级管理员", allowed_customer_ids={created_customer["id"]})
    assert any(row["付费类型"] == "线上茶疗" and row["数量/期限"] == "2天" and row["金额"] == "" for row in exported)
    assert client.delete(f"/api/online-tea/{record_id}").status_code == 200
    assert client.get(f"/api/online-tea/{record_id}").status_code == 404
    assert client.get("/api/online-tea", params={"customer_ids": created_customer["id"]}).json() == []


def test_online_tea_dates_and_validity_units_required(client, created_customer):
    payload = {
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "organization_id": "org",
        "deal_date": "2026-10-19",
        "effective_date": "2026-10-19",
    }
    for patch in (
        {"effective_date": "bad"},
        {"deal_date": ""},
        {"validity_value": 0},
        {"validity_value": -1},
        {"validity_unit": "week"},
        {"organization_id": ""},
    ):
        assert client.post("/api/online-tea", json={**payload, **patch}).status_code == 422


def test_online_tea_read_only_payment_permission_cannot_create(client, created_customer, monkeypatch):
    from app.services import position_edit_permission_service
    original = position_edit_permission_service.get_permissions
    monkeypatch.setattr(position_edit_permission_service, "get_permissions", lambda roles: {**original(roles), "payments": "view"})
    response = client.post("/api/online-tea", json={"customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        "organization_id": "org", "deal_date": "2026-10-19", "effective_date": "2026-10-19"})
    assert response.status_code == 403
