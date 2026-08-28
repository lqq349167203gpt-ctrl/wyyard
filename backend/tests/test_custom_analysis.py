from types import SimpleNamespace

import pytest

from app.models.custom_analysis import AnalysisComparisonGroup, AnalysisCondition, AnalysisPlan
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
        "payment_dates": [],
        "course_teachers": [],
        "_payment_amounts_by_project_period": {},
        "_payment_orders_by_project_period": {},
        "_payment_events_period": [],
        "_invitation_events_period": [],
        "_activity_events_period": [],
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


def test_split_comparison_uses_selected_metric(monkeypatch):
    rows = [
        _row("c1", traffic_source="小红书", payment_amount_period=398),
        _row("c2", traffic_source="小红书", payment_amount_period=5999),
        _row("c3", traffic_source="抖音", payment_amount_period=0),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(
        card_metric="payment_amount",
        card_dimension="traffic_source",
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)
    dimension_cards = [card for card in result["cards"] if card["key"].startswith("dimension-")]

    assert dimension_cards == [
        {"key": "dimension-0", "title": "小红书", "count": 6397.0, "unit": "元", "format": "currency", "is_total": False},
        {"key": "dimension-1", "title": "抖音", "count": 0.0, "unit": "元", "format": "currency", "is_total": False},
    ]


def test_payment_amount_split_by_project_reconciles_with_total(monkeypatch):
    rows = [
        _row(
            "c1",
            payment_amount_period=300,
            purchased_projects=["会员卡·体验会员", "内部课程·疗愈师课程"],
            _payment_amounts_by_project_period={"会员卡·体验会员": 100, "内部课程·疗愈师课程": 200},
        ),
        _row(
            "c2",
            payment_amount_period=50,
            purchased_projects=["会员卡·体验会员"],
            _payment_amounts_by_project_period={"会员卡·体验会员": 50},
        ),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(
        metrics=["payment_amount"],
        card_metric="payment_amount",
        card_dimension="purchased_projects",
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)
    metric_card = next(card for card in result["cards"] if card["key"] == "payment_amount")
    dimension_cards = [card for card in result["cards"] if card["key"].startswith("dimension-")]

    assert metric_card["count"] == 350
    assert {card["title"]: card["count"] for card in dimension_cards} == {
        "内部课程·疗愈师课程": 200.0,
        "会员卡·体验会员": 150.0,
    }
    assert sum(card["count"] for card in dimension_cards) == metric_card["count"]


@pytest.mark.parametrize("operator", ["eq", "contains"])
def test_payment_condition_scopes_amount_and_orders_to_matching_transactions(monkeypatch, operator):
    rows = [
        _row(
            "c1",
            payment_categories=["会员卡", "内部课程"],
            payment_count_period=2,
            payment_amount_period=300,
            _payment_events_period=[
                {
                    "purchased_projects": ["会员卡·体验会员"],
                    "payment_categories": ["会员卡"],
                    "payment_projects": ["体验会员"],
                    "payment_closers": ["小王"],
                    "payment_methods": ["微信"],
                    "payment_dates": ["2026-08-01"],
                    "amount": 100,
                    "project_label": "会员卡·体验会员",
                },
                {
                    "purchased_projects": ["内部课程·疗愈师课程"],
                    "payment_categories": ["内部课程"],
                    "payment_projects": ["疗愈师课程"],
                    "payment_closers": ["小李"],
                    "payment_methods": ["支付宝"],
                    "payment_dates": ["2026-08-02"],
                    "amount": 200,
                    "project_label": "内部课程·疗愈师课程",
                },
            ],
        ),
        _row(
            "c2",
            payment_categories=["会员卡"],
            payment_count_period=1,
            payment_amount_period=50,
            _payment_events_period=[
                {
                    "purchased_projects": ["会员卡·体验会员"],
                    "payment_categories": ["会员卡"],
                    "payment_projects": ["体验会员"],
                    "payment_closers": ["小王"],
                    "payment_methods": ["微信"],
                    "payment_dates": ["2026-08-03"],
                    "amount": 50,
                    "project_label": "会员卡·体验会员",
                },
            ],
        ),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(
        conditions=[AnalysisCondition(field="payment_categories", operator=operator, value="会员卡")],
        metrics=["total_customers", "converted_customers", "payment_orders", "payment_amount"],
        card_dimension="none",
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)

    assert result["total"] == 2
    assert {card["key"]: card["count"] for card in result["cards"]} == {
        "total_customers": 2,
        "converted_customers": 2,
        "payment_orders": 2,
        "payment_amount": 150,
    }
    assert {item["id"]: item["payment_amount_period"] for item in result["items"]} == {
        "c1": 100,
        "c2": 50,
    }


def test_course_teacher_condition_scopes_activity_metrics(monkeypatch):
    rows = [
        _row(
            "c1",
            course_teachers=["奥雅", "耀凯"],
            activity_count_period=2,
            _activity_events_period=[
                {"activity_types": ["内部课程"], "activity_names": ["课程A"], "course_teachers": ["奥雅"]},
                {"activity_types": ["沙龙活动"], "activity_names": ["活动B"], "course_teachers": ["耀凯"]},
            ],
        ),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(
        conditions=[AnalysisCondition(field="course_teachers", operator="eq", value="奥雅")],
        metrics=["total_customers", "activity_customers"],
        card_dimension="none",
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)

    assert {card["key"]: card["count"] for card in result["cards"]} == {
        "total_customers": 1,
        "activity_customers": 1,
    }
    assert result["items"][0]["activity_count_period"] == 1
    assert result["items"][0]["activity_names"] == ["课程A"]


def test_inviter_condition_scopes_invitation_metrics(monkeypatch):
    rows = [
        _row(
            "c1",
            inviter_names=["奥雅", "耀凯"],
            invitation_count_period=2,
            visit_count_period=2,
            _invitation_events_period=[
                {"inviter_names": ["奥雅"], "visit_date": "2026-01-05", "arrived": True, "cancelled": False},
                {"inviter_names": ["耀凯"], "visit_date": "2026-01-08", "arrived": True, "cancelled": False},
            ],
        ),
    ]
    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", lambda *_args: rows)
    plan = AnalysisPlan(
        conditions=[AnalysisCondition(field="inviter_names", operator="eq", value="奥雅")],
        metrics=["invited_customers", "arrived_customers"],
        card_dimension="none",
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)

    assert {card["key"]: card["count"] for card in result["cards"]} == {
        "invited_customers": 1,
        "arrived_customers": 1,
    }
    assert result["items"][0]["invitation_count_period"] == 1
    assert result["items"][0]["visit_count_period"] == 1


def test_comparison_groups_use_independent_periods_and_conditions(monkeypatch):
    def dataset(_actor_id, date_from="", date_to="", _allowed_customer_ids=None):
        if date_from == "2026-01-01":
            return [
                _row("c1", referrer="奥雅", payment_count_period=1, payment_amount_period=100),
                _row("c2", referrer="耀凯", payment_count_period=1, payment_amount_period=900),
            ]
        return [
            _row("c3", referrer="奥雅", payment_count_period=1, payment_amount_period=800),
            _row("c4", referrer="耀凯", payment_count_period=2, payment_amount_period=300),
        ]

    monkeypatch.setattr(custom_analysis_service, "build_customer_dataset", dataset)
    plan = AnalysisPlan(
        analysis_mode="comparison",
        metrics=["total_customers", "payment_orders", "payment_amount"],
        comparison_groups=[
            AnalysisComparisonGroup(
                id="a",
                name="1月奥雅",
                date_from="2026-01-01",
                date_to="2026-01-31",
                conditions=[AnalysisCondition(field="referrer", operator="eq", value="奥雅")],
            ),
            AnalysisComparisonGroup(
                id="b",
                name="2月耀凯",
                date_from="2026-02-01",
                date_to="2026-02-28",
                conditions=[AnalysisCondition(field="referrer", operator="eq", value="耀凯")],
            ),
        ],
    )

    result = custom_analysis_service.execute_plan(plan, "actor", page=1, page_size=20)

    assert [group["name"] for group in result["comparison_groups"]] == ["1月奥雅", "2月耀凯"]
    assert [row["values"] for row in result["comparison_rows"]] == [[1, 1], [1, 2], [100.0, 300.0]]
    assert result["comparison_rows"][2]["difference"] == 200.0
    assert result["comparison_rows"][2]["difference_rate"] == 200.0


def test_payment_date_condition_matches_any_transaction_date():
    row = _row("c1", payment_dates=["2026-05-12", "2026-08-20"])

    assert custom_analysis_service._matches(
        row,
        AnalysisCondition(field="payment_dates", operator="between", value=["2026-08-01", "2026-08-31"]),
    )
    assert not custom_analysis_service._matches(
        row,
        AnalysisCondition(field="payment_dates", operator="between", value=["2026-06-01", "2026-06-30"]),
    )


def test_date_condition_can_inherit_plan_period():
    condition = AnalysisCondition(
        field="payment_dates",
        operator="eq",
        value=None,
        inherit_period=True,
    )
    row = _row("c1", payment_dates=["2026-05-12", "2026-08-20"])

    assert custom_analysis_service._matches(row, condition, "2026-08-01", "2026-08-31")
    assert not custom_analysis_service._matches(row, condition, "2026-06-01", "2026-06-30")
    assert custom_analysis_service._matches(row, condition, "", "")


def test_non_date_condition_cannot_inherit_plan_period():
    with pytest.raises(ValueError, match="仅日期条件可跟随统计周期"):
        AnalysisCondition(
            field="nickname",
            operator="eq",
            value=None,
            inherit_period=True,
        )


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
    metadata = response.json()
    assert any(item["value"] == "follow_up_status" for item in metadata["fields"])
    assert any(item["value"] == "payment_dates" and item["label"] == "成交日期" for item in metadata["fields"])
    assert not any(item["value"] == "created_customers" for item in metadata["metrics"])
    assert any(item["value"] == "referred_customers" and item["label"] == "新引流客户数" for item in metadata["metrics"])


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
