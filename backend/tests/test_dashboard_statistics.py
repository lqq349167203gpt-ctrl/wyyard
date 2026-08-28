from datetime import date, datetime
from types import SimpleNamespace

from app.api import statistics


def test_dashboard_endpoint_returns_expected_shape(client):
    response = client.get("/api/statistics/dashboard")

    assert response.status_code == 200
    assert set(response.json()) == {
        "month",
        "total_customers",
        "new_customers_this_month",
        "arrived_customers_this_month",
        "arrived_customers_last_month",
        "arrival_change_rate",
        "revenue_this_month",
        "transactions_this_month",
        "not_arrived_customers",
        "not_arrived_days",
    }


def test_dashboard_summary_uses_calendar_month_and_recent_contacts(monkeypatch):
    customers = [
        SimpleNamespace(id="c1", nickname="近期到店", created_at=datetime(2026, 7, 3)),
        SimpleNamespace(id="c2", nickname="很久未到店", created_at=datetime(2026, 6, 20)),
        SimpleNamespace(id="c3", nickname="从未到店", created_at=datetime(2026, 7, 10)),
    ]
    monkeypatch.setattr(statistics.customer_service, "list_customers", lambda: customers)

    def arrived_ids(date_from: str, date_to: str):
        if date_from == "2026-07-01":
            return {"c1", "c2"}
        if date_from == "2026-07-04":
            return {"c1"}
        return {"c1"}

    monkeypatch.setattr(statistics.visit_service, "get_arrived_customer_ids", arrived_ids)

    payments = [
        SimpleNamespace(deal_date="2026-07-05", amount=398, voided=False),
        SimpleNamespace(deal_date="2026-07-08", price=1000, voided=False),
        SimpleNamespace(deal_date="2026-07-09", fee=500, voided=True),
        SimpleNamespace(deal_date="2026-06-30", amount=200, voided=False),
    ]
    monkeypatch.setattr(statistics, "_payment_record_groups", lambda: [payments])

    result = statistics._build_dashboard_summary(date(2026, 7, 18))

    assert result["total_customers"] == 3
    assert result["new_customers_this_month"] == 2
    assert result["arrived_customers_this_month"] == 2
    assert result["arrived_customers_last_month"] == 1
    assert result["arrival_change_rate"] == 100.0
    assert result["revenue_this_month"] == 1398.0
    assert result["transactions_this_month"] == 2
    assert result["not_arrived_customers"] == 2
    assert result["not_arrived_days"] == 14


def test_referral_statistics_filters_referrer_and_groups_status(monkeypatch):
    customers = [
        SimpleNamespace(
            id="c1",
            nickname="新客户",
            member_type="普通会员",
            referrer="小林",
            referrer_handler="小王",
            traffic_source="小红书",
            follow_up_status="新添加",
            referral_date="2026-07-03",
            created_at=datetime(2026, 6, 23),
        ),
        SimpleNamespace(
            id="c2",
            nickname="沟通客户",
            member_type="普通会员",
            referrer="小林",
            referrer_handler="小赵",
            traffic_source="抖音",
            follow_up_status="前期沟通中",
            referral_date="2026-07-04",
            created_at=datetime(2026, 6, 24),
        ),
        SimpleNamespace(
            id="c3",
            nickname="其他客户",
            member_type="",
            referrer="小周",
            referrer_handler="",
            traffic_source="",
            follow_up_status="已成交",
            referral_date="2026-07-05",
            created_at=datetime(2026, 6, 25),
        ),
        SimpleNamespace(
            id="c4",
            nickname="待配置客户",
            member_type="普通会员",
            referrer="小林",
            referrer_handler="小王",
            traffic_source="小红书",
            follow_up_status="未配置",
            referral_date="2026-07-06",
            created_at=datetime(2026, 6, 26),
        ),
        # 引流人筛选只显示当前仍有效的客户昵称；这两条作为有效引流人员，
        # 本身没有引流日期，不参与下方人数统计。
        SimpleNamespace(
            id="referrer-xiaolin",
            nickname="小林",
            member_type="",
            referrer="",
            referrer_handler="",
            traffic_source="",
            follow_up_status="未配置",
            referral_date="",
            created_at=datetime(2026, 6, 1),
        ),
        SimpleNamespace(
            id="referrer-xiaozhou",
            nickname="小周",
            member_type="",
            referrer="",
            referrer_handler="",
            traffic_source="",
            follow_up_status="未配置",
            referral_date="",
            created_at=datetime(2026, 6, 1),
        ),
    ]
    monkeypatch.setattr(statistics.customer_service, "list_customers", lambda: customers)
    monkeypatch.setattr(
        statistics.customer_tag_service,
        "visible_tags_by_customer",
        lambda _actor_id: {
            "c1": [{"id": "tag-a"}],
            "c2": [{"id": "tag-a"}, {"id": "tag-b"}],
            "c3": [{"id": "tag-b"}],
        },
    )
    monkeypatch.setattr(statistics, "_get_customer_stats", lambda customer_id, *_: {
        "first_visit_date": "-",
        "invited_count": 0,
        "visit_count": 0,
        "visit_interval": "-",
        "activity_count": 0,
        "total_consumption": 0,
    })

    result = statistics.get_referral_statistics(
        date_from="2026-07-01",
        date_to="2026-07-31",
        granularity="day",
        referrer="小林",
    )

    assert result["total_people"] == 3
    assert result["status_totals"]["未配置"] == 1
    assert result["status_totals"]["新添加"] == 1
    assert result["status_totals"]["前期沟通中"] == 1
    assert result["status_totals"]["已成交"] == 0
    assert result["summary_total_people"] == 3
    assert result["summary_status_totals"]["未配置"] == 1
    assert result["referrer_names"] == ["小林", "小周"]
    assert result["traffic_source_names"] == ["小红书", "抖音", "未配置"]
    assert result["summary_traffic_source_totals"] == {"小红书": 2, "抖音": 1}
    assert result["tag_totals"] == {"tag-a": 2, "tag-b": 1}
    assert {member["id"] for member in result["members"]} == {"c1", "c2", "c4"}
    assert {member["referral_date"] for member in result["members"]} == {"2026-07-03", "2026-07-04", "2026-07-06"}

    # 会员类型多选筛选：选中"普通会员"时只统计 c1、c2、c4
    result_by_type = statistics.get_referral_statistics(
        date_from="2026-07-01",
        date_to="2026-07-31",
        granularity="day",
        referrer=None,
        member_types="普通会员",
    )
    assert result_by_type["total_people"] == 3
    assert {member["id"] for member in result_by_type["members"]} == {"c1", "c2", "c4"}
    # 筛选选项保持全量，不随筛选塌缩
    assert "普通会员" in result_by_type["member_type_names"]

    # 跟进阶段筛选联动统计、趋势、列表和标签人数
    result_by_status = statistics.get_referral_statistics(
        date_from="2026-07-01",
        date_to="2026-07-31",
        granularity="day",
        referrer=None,
        member_types=None,
        follow_up_status="前期沟通中",
    )
    assert result_by_status["total_people"] == 1
    assert result_by_status["status_totals"]["前期沟通中"] == 1
    assert result_by_status["summary_total_people"] == 4
    assert result_by_status["summary_status_totals"]["未配置"] == 1
    assert result_by_status["summary_status_totals"]["前期沟通中"] == 1
    assert result_by_status["summary_traffic_source_totals"] == {"抖音": 1}
    assert {member["id"] for member in result_by_status["members"]} == {"c2"}
    assert result_by_status["tag_totals"] == {"tag-a": 1, "tag-b": 1}

    # 流量来源筛选联动卡片、趋势和列表；来源卡片本身保持完整分布。
    result_by_source = statistics.get_referral_statistics(
        date_from="2026-07-01",
        date_to="2026-07-31",
        granularity="day",
        referrer=None,
        member_types=None,
        traffic_source="小红书",
    )
    assert result_by_source["total_people"] == 2
    assert result_by_source["summary_status_totals"]["新添加"] == 1
    assert result_by_source["summary_status_totals"]["未配置"] == 1
    assert result_by_source["summary_traffic_source_totals"] == {
        "小红书": 2,
        "抖音": 1,
        "未配置": 1,
    }
    assert result_by_source["tag_totals"] == {"tag-a": 1}
    assert {member["id"] for member in result_by_source["members"]} == {"c1", "c4"}

    # 选中多个类型时合并统计；选中的类型不存在时为空
    result_multi = statistics.get_referral_statistics(
        date_from="2026-07-01",
        date_to="2026-07-31",
        granularity="day",
        referrer=None,
        member_types="普通会员,体验会员",
    )
    assert result_multi["total_people"] == 3
    result_empty = statistics.get_referral_statistics(
        date_from="2026-07-01",
        date_to="2026-07-31",
        granularity="day",
        referrer=None,
        member_types="体验会员",
    )
    assert result_empty["total_people"] == 0
    assert result_empty["members"] == []
