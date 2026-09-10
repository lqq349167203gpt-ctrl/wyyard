def test_financial_records_crud(client):
    commission_id = ""
    benefit_id = ""
    try:
        commission_response = client.post("/api/financial/commissions", json={
            "month": "2026-08",
            "person_id": "person-1",
            "person_name": "测试员工",
            "amount": 1200,
            "notes": "八月分成",
        })
        assert commission_response.status_code == 200
        commission_id = commission_response.json()["id"]
        assert commission_response.json()["created_by"] == "不闹"

        filtered_commissions = client.get("/api/financial/commissions", params={"month": "2026-08"})
        assert filtered_commissions.status_code == 200
        assert any(item["id"] == commission_id for item in filtered_commissions.json()["items"])
        other_month_commissions = client.get("/api/financial/commissions", params={"month": "2026-07"})
        assert other_month_commissions.status_code == 200
        assert all(item["id"] != commission_id for item in other_month_commissions.json()["items"])

        benefit_response = client.post("/api/financial/staff-benefits", json={
            "benefit_date": "2026-08-10",
            "content": "节日福利",
            "amount": 300,
            "notes": "",
        })
        assert benefit_response.status_code == 200
        benefit_id = benefit_response.json()["id"]
    finally:
        if commission_id:
            client.delete(f"/api/financial/commissions/{commission_id}")
        if benefit_id:
            client.delete(f"/api/financial/staff-benefits/{benefit_id}")


def test_financial_record_operation_logs_keep_chinese_details_after_delete(client):
    commission_response = client.post("/api/financial/commissions", json={
        "month": "2026-08",
        "person_id": "person-log-test",
        "person_name": "日志测试员工",
        "amount": 123,
        "notes": "分成日志备注",
    })
    assert commission_response.status_code == 200
    commission_id = commission_response.json()["id"]

    benefit_response = client.post("/api/financial/staff-benefits", json={
        "benefit_date": "2026-08-14",
        "content": "日志测试福利",
        "amount": 12,
        "notes": "福利日志备注",
    })
    assert benefit_response.status_code == 200
    benefit_id = benefit_response.json()["id"]

    commission_create_logs = client.get("/api/operation-logs", params={"entity_id": commission_id, "method": "POST"}).json()
    assert commission_create_logs[0]["content"] == "新增分成：月份：2026-08｜人员：日志测试员工｜金额：¥123｜备注：分成日志备注"

    benefit_create_logs = client.get("/api/operation-logs", params={"entity_id": benefit_id, "method": "POST"}).json()
    assert benefit_create_logs[0]["content"] == "新增人员福利：日期：2026-08-14｜福利内容：日志测试福利｜金额：¥12｜备注：福利日志备注"

    assert client.delete(f"/api/financial/commissions/{commission_id}").status_code == 200
    assert client.delete(f"/api/financial/staff-benefits/{benefit_id}").status_code == 200

    commission_delete_logs = client.get("/api/operation-logs", params={"entity_id": commission_id, "method": "DELETE"}).json()
    assert commission_delete_logs[0]["content"] == "删除分成：月份：2026-08｜人员：日志测试员工｜金额：¥123｜备注：分成日志备注"
    assert commission_delete_logs[0]["before_data"]["person_name"] == "日志测试员工"

    benefit_delete_logs = client.get("/api/operation-logs", params={"entity_id": benefit_id, "method": "DELETE"}).json()
    assert benefit_delete_logs[0]["content"] == "删除人员福利：日期：2026-08-14｜福利内容：日志测试福利｜金额：¥12｜备注：福利日志备注"
    assert benefit_delete_logs[0]["before_data"]["content"] == "日志测试福利"
