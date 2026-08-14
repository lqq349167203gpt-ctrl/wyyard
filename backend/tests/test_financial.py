from app.services import financial_service


class _FinancialTestRecord:
    def __init__(self, **data):
        self.data = data

    def model_dump(self, mode="json"):
        return self.data


def test_financial_records_and_overview(client):
    commission_id = ""
    benefit_id = ""
    expense_id = ""
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

        expense_response = client.post("/api/expenses", json={
            "cost_category": "management",
            "expense_type": "办公采购",
            "expense_time": "2026-08-11T09:00",
            "purchase_content": "打印纸",
            "amount": 100,
            "platform": "线下",
            "notes": "",
        })
        assert expense_response.status_code == 200
        expense_id = expense_response.json()["id"]

        overview_response = client.get("/api/financial/overview", params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-31",
        })
        assert overview_response.status_code == 200
        overview = overview_response.json()
        assert overview["management_cost"] == 100
        assert overview["operation_cost"] == 0
        assert overview["total_expense"] == 100
        assert "commission_total" not in overview
        assert "staff_benefit_total" not in overview
        assert overview["date_from"] == "2026-08-01"
        assert overview["date_to"] == "2026-08-31"

        expense_details = client.get("/api/financial/composition-details", params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-31",
            "kind": "expense",
        })
        assert expense_details.status_code == 200
        expense_row = next(item for item in expense_details.json()["data"] if item["id"] == expense_id)
        assert expense_row["primary"] == "管理成本"
        assert expense_row["secondary"] == "办公采购"

        removed_composition = client.get("/api/financial/composition-details", params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-31",
            "kind": "commission",
        })
        assert removed_composition.status_code == 422
    finally:
        if commission_id:
            client.delete(f"/api/financial/commissions/{commission_id}")
        if benefit_id:
            client.delete(f"/api/financial/staff-benefits/{benefit_id}")
        if expense_id:
            client.delete(f"/api/expenses/{expense_id}")


def test_expense_type_configuration(client):
    type_id = ""
    try:
        response = client.post("/api/expenses/types", json={
            "cost_category": "operation",
            "name": "平台投放",
            "requires_customer": False,
            "requires_platform": True,
        })
        assert response.status_code == 200
        type_id = response.json()["id"]

        list_response = client.get("/api/expenses/types/list", params={"cost_category": "operation"})
        assert list_response.status_code == 200
        configured_type = next(item for item in list_response.json() if item["id"] == type_id)
        assert configured_type["requires_customer"] is False
        assert configured_type["requires_platform"] is True
    finally:
        if type_id:
            client.delete(f"/api/expenses/types/{type_id}")


def test_financial_overview_rejects_reversed_date_range(client):
    response = client.get("/api/financial/overview", params={
        "date_from": "2026-08-31",
        "date_to": "2026-08-01",
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "开始日期不能晚于结束日期"


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


def test_financial_revenue_breakdown_counts_unique_customers_and_lists_orders(client, monkeypatch):
    records = [
        _FinancialTestRecord(
            id="card-1",
            customer_id="customer-1",
            nickname="小林",
            card_type="45次卡",
            price=5999,
            total_count=45,
            deal_date="2026-08-12",
            closers=[{"name": "成交甲", "amount": 5999}],
            notes="首单",
            created_at="2026-08-12T10:00:00",
        ),
        _FinancialTestRecord(
            id="card-2",
            customer_id="customer-1",
            nickname="小林",
            card_type="45次卡",
            price=1000,
            total_count=10,
            deal_date="2026-08-13",
            closer_name="成交乙",
            notes="加购",
            created_at="2026-08-13T10:00:00",
        ),
    ]
    monkeypatch.setattr(financial_service, "PROJECT_SOURCES", (("membership_card", "会员卡", lambda: records),))
    monkeypatch.setattr(financial_service.expense_service, "list_expenses", lambda *_: [])
    monkeypatch.setattr(financial_service.project_refund_service, "list_refunds", lambda: [])

    overview = financial_service.get_overview("2026-08-01", "2026-08-31")
    row = overview["group_class_breakdown"][0]
    assert row["deal_count"] == 2
    assert row["customer_count"] == 1

    response = client.get("/api/financial/revenue-details", params={
        "date_from": "2026-08-01",
        "date_to": "2026-08-31",
        "category": "group",
        "name": "45次卡",
    })
    assert response.status_code == 200
    orders = response.json()["data"]
    assert [order["id"] for order in orders] == ["card-2", "card-1"]
    assert orders[0]["closers"] == [{"name": "成交乙", "amount": 1000.0}]
    assert orders[1]["quantity"] == "45次"
