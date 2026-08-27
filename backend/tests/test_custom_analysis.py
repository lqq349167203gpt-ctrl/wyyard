from types import SimpleNamespace

from app.models.custom_analysis import AnalysisCondition, AnalysisPlan
from app.services import custom_analysis_service


def _row(customer_id: str, **overrides):
    row = {
        "id": customer_id,
        "nickname": f"客户{customer_id}",
        "name": "",
        "gender": "",
        "age": "",
        "member_type": "普通会员",
        "follow_up_status": "前期沟通中",
        "customer_tags": [],
        "traffic_source": "小红书",
        "referrer": "小王",
        "referrer_handler": "小李",
        "service_teacher": "老师A",
        "referral_date": "2026-08-01",
        "created_at": "2026-08-01",
        "first_visit_date": "",
        "last_visit_date": "",
        "invitation_count": 0,
        "visit_count": 0,
        "activity_count": 0,
        "communication_count": 0,
        "total_consumption": 0,
        "created_in_period": True,
        "referred_in_period": True,
        "invitation_count_period": 0,
        "visit_count_period": 0,
        "activity_count_period": 0,
        "payment_count_period": 0,
        "payment_amount_period": 0,
    }
    row.update(overrides)
    return row


def test_execute_plan_filters_and_builds_dynamic_cards(monkeypatch):
    rows = [
        _row("c1", total_consumption=800, customer_tags=["高意向"]),
        _row("c2", total_consumption=1200, customer_tags=["高意向", "晚间偏好"]),
        _row("c3", visit_count=2, total_consumption=300, traffic_source="抖音"),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(
        title="未到店低消费客户",
        total_card_title="目标客户",
        conditions=[
            AnalysisCondition(field="visit_count", operator="eq", value=0),
            AnalysisCondition(field="total_consumption", operator="lt", value=1000),
        ],
        card_dimension="customer_tags",
        columns=["nickname", "visit_count", "total_consumption"],
        sort_by="total_consumption",
        sort_order="desc",
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)

    assert result["total"] == 1
    assert [item["id"] for item in result["items"]] == ["c1"]
    assert result["cards"] == [
        {"key": "total_customers", "title": "目标客户", "count": 1, "unit": "人", "format": "number", "is_total": True},
        {"key": "dimension-0", "title": "高意向", "count": 1, "unit": "人", "format": "number", "is_total": False},
    ]


def test_execute_plan_keeps_empty_values_at_end_when_descending(monkeypatch):
    rows = [
        _row("c1", referral_date=""),
        _row("c2", referral_date="2026-08-02"),
        _row("c3", referral_date="2026-08-01"),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(sort_by="referral_date", sort_order="desc")

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)

    assert [item["id"] for item in result["items"]] == ["c2", "c3", "c1"]


def test_execute_plan_supports_any_logic_and_selected_metrics(monkeypatch):
    rows = [
        _row("c1", traffic_source="小红书", invitation_count_period=1, visit_count_period=1),
        _row("c2", traffic_source="抖音", payment_count_period=2, payment_amount_period=796),
        _row("c3", traffic_source="朋友推荐"),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(
        conditions=[
            AnalysisCondition(field="traffic_source", operator="eq", value="小红书"),
            AnalysisCondition(field="payment_count_period", operator="gt", value=0),
        ],
        condition_logic="any",
        metrics=["total_customers", "arrived_customers", "converted_customers", "payment_orders", "payment_amount"],
        card_dimension="none",
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)

    assert result["total"] == 2
    assert {card["key"]: card["count"] for card in result["cards"]} == {
        "total_customers": 2,
        "arrived_customers": 1,
        "converted_customers": 1,
        "payment_orders": 2,
        "payment_amount": 796,
    }


def test_local_parser_recognizes_common_conditions(monkeypatch):
    monkeypatch.setattr(custom_analysis_service.customer_service, "list_customers", lambda: [
        SimpleNamespace(
            id="c1",
            member_type="普通会员",
            traffic_source="小红书",
            referrer="小王",
            referrer_handler="小李",
            service_teacher="老师A",
        ),
    ])
    monkeypatch.setattr(
        custom_analysis_service.customer_tag_service,
        "visible_tags_by_customer",
        lambda _actor_id: {},
    )

    plan = custom_analysis_service._local_plan(
        "筛选小红书来源、没有到店、消费低于1万元的客户，按流量来源统计",
        "actor",
    )

    conditions = {(item.field, item.operator, item.value) for item in plan.conditions}
    assert ("traffic_source", "eq", "小红书") in conditions
    assert ("visit_count", "eq", 0) in conditions
    assert ("total_consumption", "lt", 10000.0) in conditions
    assert plan.card_dimension == "traffic_source"


def test_metadata_endpoint(client):
    response = client.get("/api/custom-analysis/metadata")
    assert response.status_code == 200
    assert any(item["value"] == "follow_up_status" for item in response.json()["fields"])


def test_execute_endpoint_returns_matching_customer(client, sample_customer):
    created = client.post("/api/customers", json=sample_customer).json()
    try:
        response = client.post("/api/custom-analysis/execute", json={
            "plan": {
                "title": "指定客户",
                "total_card_title": "符合条件",
                "conditions": [
                    {"field": "nickname", "operator": "eq", "value": created["nickname"]},
                ],
                "card_dimension": "none",
                "columns": ["nickname", "member_type"],
                "sort_by": "nickname",
                "sort_order": "asc",
            },
            "page": 1,
            "page_size": 20,
        })
        assert response.status_code == 200
        assert response.json()["total"] == 1
        assert response.json()["items"][0]["id"] == created["id"]

        logs_response = client.get("/api/analysis-logs?record_type=analysis")
        assert logs_response.status_code == 200
        assert all(item["log_type"] == "analysis_executed" for item in logs_response.json()["items"])
        matching_logs = [
            item for item in logs_response.json()["items"]
            if item["config"].get("标题") == "指定客户"
        ]
        assert matching_logs
        assert matching_logs[0]["config"]["筛选条件"] == [
            {"字段": "昵称", "规则": "等于", "值": created["nickname"]},
        ]
        assert matching_logs[0]["config"]["结果人数"] == 1
    finally:
        client.delete(f"/api/customers/{created['id']}")


def test_analysis_template_crud(client):
    payload = {
        "name": "本月引流测试模板",
        "description": "查看本月引流、邀约和到店转化",
        "scope": "private",
        "plan": AnalysisPlan(card_dimension="none").model_dump(mode="json"),
    }
    created = client.post("/api/custom-analysis/templates", json=payload)
    assert created.status_code == 200
    assert created.json()["description"] == payload["description"]
    template_id = created.json()["id"]
    try:
        listed = client.get("/api/custom-analysis/templates")
        assert listed.status_code == 200
        assert any(item["id"] == template_id for item in listed.json())

        logs = client.get("/api/analysis-logs?record_type=template")
        assert logs.status_code == 200
        assert all(item["log_type"].startswith("template_") for item in logs.json()["items"])
        saved_log = next(
            item for item in logs.json()["items"]
            if item["log_type"] == "template_created"
            and item["config"].get("模板名称") == payload["name"]
        )
        assert saved_log["operator"] == "不闹"
        assert saved_log["config"]["模板简介"] == payload["description"]
        assert saved_log["config"]["可见范围"] == "仅自己可见"

        used = client.post(f"/api/custom-analysis/templates/{template_id}/use")
        assert used.status_code == 200
        assert used.json()["use_count"] == 1

        updated = client.patch(
            f"/api/custom-analysis/templates/{template_id}",
            json={"name": "本月引流漏斗", "description": "更新后的模板简介"},
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "本月引流漏斗"
        assert updated.json()["description"] == "更新后的模板简介"
    finally:
        deleted = client.delete(f"/api/custom-analysis/templates/{template_id}")
        assert deleted.status_code == 200
