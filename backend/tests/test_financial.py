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
        assert overview["commission_total"] == 1200
        assert overview["staff_benefit_total"] == 300
        assert overview["net_profit"] is None
        assert overview["date_from"] == "2026-08-01"
        assert overview["date_to"] == "2026-08-31"
        assert overview["operating_profit"] == overview["total_revenue"] - 1600 - overview["refund_total"]

        expense_details = client.get("/api/financial/composition-details", params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-31",
            "kind": "expense",
        })
        assert expense_details.status_code == 200
        expense_row = next(item for item in expense_details.json()["data"] if item["id"] == expense_id)
        assert expense_row["primary"] == "管理成本"
        assert expense_row["secondary"] == "办公采购"

        commission_details = client.get("/api/financial/composition-details", params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-31",
            "kind": "commission",
        })
        assert commission_details.status_code == 200
        assert any(item["id"] == commission_id and item["primary"] == "测试员工" for item in commission_details.json()["data"])

        benefit_details = client.get("/api/financial/composition-details", params={
            "date_from": "2026-08-01",
            "date_to": "2026-08-31",
            "kind": "benefit",
        })
        assert benefit_details.status_code == 200
        assert any(item["id"] == benefit_id and item["primary"] == "节日福利" for item in benefit_details.json()["data"])
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
        })
        assert response.status_code == 200
        type_id = response.json()["id"]

        list_response = client.get("/api/expenses/types/list", params={"cost_category": "operation"})
        assert list_response.status_code == 200
        assert any(item["id"] == type_id for item in list_response.json())
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
    monkeypatch.setattr(financial_service.financial_record_service, "list_commissions", lambda: [])
    monkeypatch.setattr(financial_service.financial_record_service, "list_benefits", lambda *_: [])
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
