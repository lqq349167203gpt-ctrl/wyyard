from types import SimpleNamespace as NS

from app.api import principal as principal_api
from app.models.principal import PrincipalQuery
from app.services.principal_mobile_service import mobile_result, selected_customers, traffic_quick_filter


def _result():
    customers = [{"id": f"c{i}", "name": f"客户{i}", "deals": i % 2, "tags": ["关注"],
                  "arrive_count": 1, "cancel_count": 0, "no_show_count": 0, "invite_count": 1,
                  "products": [{"key": "membership", "label": "会员卡", "count": i % 2}],
                  "upsell_levels": [], "arrival_records": [{"id": f"v{i}", "arrive_date": "2026-01-01"}]}
                 for i in range(25)]
    return {"summary": {"引流人数": 25}, "items": [], "total": 0, "breakdown": {
        "traffic": [{"key": "老师", "label": "老师", "count": 25, "customers": customers}],
        "invite_inviters": [{"key": "老师", "label": "老师", "count": 25, "initiated_count": 25,
                             "records": [{"id": f"v{i}", "customer_id": f"c{i}"} for i in range(25)]}],
        "traffic_upsell_levels": [], "traffic_profile_fields": [],
    }}


def test_mobile_traffic_is_paged_without_nested_customers():
    first = mobile_result(_result(), PrincipalQuery(mobile_group="traffic", page_size=20))
    second = mobile_result(_result(), PrincipalQuery(mobile_group="traffic", page=2, page_size=20))
    assert first["total"] == second["total"] == 25
    assert len(first["items"]) == 20 and len(second["items"]) == 5
    assert first["mobile"]["traffic_count"] == 25
    assert "customers" not in first["breakdown"]["traffic"][0]
    assert "records" not in first["breakdown"]["invite_inviters"][0]
    assert "arrival_records" not in first["items"][0]


def test_mobile_invite_detail_and_filters_keep_full_totals():
    result = _result()
    chosen = selected_customers(result["breakdown"], ["traffic:老师", "tag:关注"])
    assert len(chosen) == 25
    assert len(traffic_quick_filter(chosen, "deals")) == 12
    arrived = mobile_result(result, PrincipalQuery(mobile_group="invite_arrive", arrival_view="date", page_size=20))
    assert arrived["total"] == 25 and len(arrived["items"]) == 20
    detail = mobile_result(result, PrincipalQuery(mobile_group="invite_initiated", mobile_detail_key="老师", page=2, page_size=20))
    assert detail["mobile"]["detail_total"] == 25
    assert len(detail["mobile"]["detail_records"]) == 5


def test_mobile_invite_numeric_sort_uses_numbers_not_text():
    result = _result()
    customers = result["breakdown"]["traffic"][0]["customers"]
    customers[0]["deals"] = 2
    customers[1]["deals"] = 10
    customers[0]["visit_interval"] = "2天"
    customers[1]["visit_interval"] = "10天"

    by_deals = mobile_result(result, PrincipalQuery(mobile_group="invite_arrive", sort_by="deals", sort_order="desc"))
    by_interval = mobile_result(result, PrincipalQuery(mobile_group="invite_arrive", sort_by="visit_interval", sort_order="asc", page_size=30))
    assert by_deals["items"][0]["id"] == "c1"
    assert by_deals["items"][1]["id"] == "c0"
    ids = [item["id"] for item in by_interval["items"]]
    assert ids.index("c0") < ids.index("c1")


def test_mobile_arrival_date_groups_page_by_day_and_keep_visit_content():
    customers = [{
        "id": "c1", "name": "甲", "arrive_count": 0,
        "invite_visits": [
            {"id": "late", "arrive_date": "2026-09-02", "arrive_time": "19:00", "arrive_inviter": "王老师",
             "needs": "想了解课程", "same_day_activities": "读书会、能量结", "same_day_deal_text": "会员卡 · 年卡",
             "status": "cancelled", "status_label": "已取消"},
            {"id": "early", "arrive_date": "2026-09-01", "arrive_time": "09:00", "status": "arrived", "status_label": "已到店"},
        ],
    }]
    result = {"items": [], "total": 0, "summary": {}, "breakdown": {
        "invite_traffic": [{"key": "老师", "label": "老师", "customers": customers}],
        "traffic": [], "invite_inviters": [],
    }}
    first = mobile_result(result, PrincipalQuery(mobile_group="invite_arrive", arrival_view="date_group", page_size=1, sort_by="name"))
    second = mobile_result(result, PrincipalQuery(mobile_group="invite_arrive", arrival_view="date_group", page=2, page_size=1))
    assert first["total"] == 2 and first["items"][0]["date"] == "2026-09-02"
    assert first["items"][0]["records"][0]["same_day_deal_text"] == "会员卡 · 年卡"
    assert "invite_visits" not in first["items"][0]
    assert second["items"][0]["date"] == "2026-09-01"


def test_light_metadata_does_not_scan_historical_events(monkeypatch):
    monkeypatch.setattr(principal_api.principal_service, "scope", lambda _: (
        [NS(id="org", name="俱乐部")], {}, {"principal_scope": "all", "customer_access": {
            "transaction_access": "detail", "detail_tabs": {"follow_up": True},
        }},
    ))
    monkeypatch.setattr(principal_api.principal_service, "collect_data", lambda *_args, **_kwargs: 1 / 0)
    result = principal_api.metadata(NS(), lite=True)
    assert result["organizations"] == [{"id": "org", "name": "俱乐部", "status": "active"}]
    assert result["can_view_follow_up"] is True


def test_mobile_participation_pages_people_and_matches_pc_role_and_type_filters():
    from copy import deepcopy

    result = _result()
    result['breakdown']['participation'] = {'members': [
        {'id': f'm{i:02d}', 'name': f'成员{i:02d}', 'activities': [
            {'date': '2026-10-01', 'name': '觉醒游戏', 'type': '觉醒游戏', 'activity_type': 'gcs',
             'course_key': 'game', 'role': '案主', 'teachers': '老师甲'},
            *([{'date': '2026-10-02', 'name': '读书会', 'type': '沙龙活动', 'activity_type': 'class',
                'course_key': '读书会', 'role': '参与者', 'teachers': '老师乙'}] if i % 2 else []),
        ]} for i in range(25)
    ]}
    before = deepcopy(result)
    first = mobile_result(result, PrincipalQuery(mobile_group='participation', page_size=20))
    second = mobile_result(result, PrincipalQuery(mobile_group='participation', page=2, page_size=20))
    assert first['total'] == second['total'] == 25
    assert len(first['items']) == 20 and len(second['items']) == 5
    assert first['total_pages'] == 2 and second['page'] == 2
    assert len({row['id'] for row in first['items'] + second['items']}) == 25
    assert [row['count'] for row in first['items'] + second['items']] == [2] * 12 + [1] * 13
    assert 'members' not in first['breakdown']['participation']
    assert first['items'][0]['owner_count'] == first['items'][0]['participant_count'] == 1
    assert first['items'][0]['activities'][0]['teachers'] == '老师甲'
    selected = mobile_result(result, PrincipalQuery(mobile_group='participation', breakdown=['participation_type:class', 'participation_course:读书会']))
    assert selected['total'] == 12
    assert all(row['count'] == row['participant_count'] == 1 and row['owner_count'] == 0 for row in selected['items'])
    assert all(row['activities'][0]['type'] == '沙龙活动' for row in selected['items'])
    assert result == before


def test_mobile_participation_api_uses_person_scope_and_empty_or_out_of_range_pages(monkeypatch):
    result = _result()
    result['breakdown']['participation'] = {'members': []}
    calls = []

    def analyzed(_request, query):
        calls.append(query)
        return result

    monkeypatch.setattr(principal_api.principal_query_cache, 'query_result', analyzed)
    query = PrincipalQuery(scope_type='person', referrer_id='referrer', mobile_group='participation', page=9)
    response = principal_api.query(query, NS(state=NS()))
    assert calls == [query]
    assert response['total'] == 0 and response['items'] == []
    assert response['page'] == response['total_pages'] == 1
    assert 'members' not in response['breakdown']['participation']
