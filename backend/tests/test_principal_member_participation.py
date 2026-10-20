"""组织所属引流人的全部客户，按活动发生日期统计跨组织参与情况。"""

import json
from datetime import date
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.api import principal as principal_api
from app.api import statistics
from app.models.principal import PrincipalQuery
from app.services import course_service, course_type_service
from app.services import principal_service as service
from app.services.principal_mobile_service import compact_breakdown, mobile_result
from app.services.principal_response_service import detail_page


def activity(**values):
    return NS(**{
        "id": "activity", "date": "2026-01-15", "owner_id": "", "description": "",
        "participant_ids": [], "teacher_ids": [], "withdrawn_participant_ids": [],
        "groups": [], "is_deleted": False,
        **values,
    })


def install_activities(monkeypatch, by_kind, arrived):
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", tuple(
        (kind, kind, lambda records=records: records) for kind, records in by_kind.items()
    ))
    monkeypatch.setattr(service.visit_service, "get_arrived_customer_ids_by_date", lambda: arrived)


def test_member_roles_accumulate_across_activities_and_energy_parts_are_not_visits(monkeypatch):
    install_activities(monkeypatch, {
        "gcs": [activity(owner_id="m1", participant_ids=["m1", "m2", "m2", "guest", "absent"])],
        "ers": [activity(owner_id="m2", participant_ids=["m1"])],
        "eks": [activity(owner_id="m1", participant_ids=["m1", "m2", "m3"], description=json.dumps([
            {"id": "m1", "count": 2}, {"id": "m3", "count": 3}, {"id": "m3", "count": 1},
        ]))],
    }, {"2026-01-15": {"m1", "m2", "m3", "guest"}})

    assert service._member_participation_totals({"m1", "m2", "m3", "absent"}, "2026-01-01", "2026-01-31") == {
        "活动参与次数": 7, "活动案主次数": 4, "活动参与者次数": 3,
    }


def test_participants_include_group_members_and_exclude_teachers_hosts_and_withdrawals(monkeypatch):
    install_activities(monkeypatch, {
        "class": [activity(participant_ids=["m1", "teacher", "withdrawn", "absent"],
                           teacher_ids=["teacher"], withdrawn_participant_ids=["withdrawn"],
                           groups=[NS(leader_id="m2", deputy_id="m1", member_ids=["m2"])])],
        "ics": [activity(participant_ids=["m1", "teacher", "host", "achiever", "withdrawn"],
                         teacher_ids=["teacher"], host_id="host", achiever_id="achiever",
                         withdrawn_participant_ids=["withdrawn"])],
    }, {"2026-01-15": {"m1", "m2", "teacher", "host", "achiever", "withdrawn"}})

    assert service._member_participation_totals(
        {"m1", "m2", "teacher", "host", "achiever", "withdrawn", "absent"}, "2026-01-01", "2026-01-31",
    ) == {"活动参与次数": 3, "活动案主次数": 0, "活动参与者次数": 3}


def test_period_is_inclusive_and_excludes_deleted_undated_and_unattended_activities(monkeypatch):
    days = ["2025-12-31", "2026-01-01", "2026-01-31", "2026-02-01", "2026-01-16"]
    install_activities(monkeypatch, {
        "gcs": [*[activity(date=day, owner_id="m1") for day in days],
                activity(date="2026-01-15", owner_id="m1", is_deleted=True),
                activity(date="invalid", owner_id="m1")],
    }, {day: {"m1"} for day in days[:-1]} | {"2026-01-15": {"m1"}})

    assert service._member_participation_totals({"m1"}, "2026-01-01", "2026-01-31") == {
        "活动参与次数": 2, "活动案主次数": 2, "活动参与者次数": 0,
    }
    assert service._member_participation_totals({"m1"}, "2026-02-02", "2026-02-28")["活动参与次数"] == 0


def test_empty_members_do_not_load_other_organizations_activities(monkeypatch):
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("gcs", "觉醒游戏", lambda: pytest.fail("无成员时不加载活动")),
    ))
    assert service._member_participation_totals(set(), "2026-01-01", "2026-01-31") == {
        "活动参与次数": 0, "活动案主次数": 0, "活动参与者次数": 0,
    }


@pytest.mark.parametrize("picks", [[], ["participation_type:gcs", "participation_person:client-shared"]])
@pytest.mark.parametrize("organization_id, expected_participants", [("a", 1), ("b", 1), ("", 2)])
def test_overview_uses_referred_clients_of_selected_organizations_not_the_members_themselves(
    monkeypatch, organization_id, expected_participants, picks,
):
    orgs = [NS(id="a", name="甲", member_ids=["shared", "m1", "deleted"], referrer_mode="member"),
            NS(id="b", name="乙", member_ids=["shared", "m2"], referrer_mode="member")]
    people = {cid: NS(id=cid, nickname=cid, name="", referrer="其他引流人") for cid in ("shared", "m1", "m2")}
    people.update({cid: NS(id=cid, nickname=cid, name="", referrer=referrer, referral_date=referral_date)
                   for cid, referrer, referral_date in (("client-shared", "shared", "2025-01-01"),
                                                       ("client-a", "m1", "2026-01-01"),
                                                       ("client-b", "m2", ""))})
    permissions = {"customer_access": {"transaction_access": "none"}}
    monkeypatch.setattr(service, "collect_data", lambda _: (orgs, permissions, [], []))
    monkeypatch.setattr(service, "scope", lambda _: (orgs, people, permissions))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: list(people.values()))
    monkeypatch.setattr(service.visit_service, "list_basic_visits", lambda _: [])
    install_activities(monkeypatch, {"gcs": [activity(
        id="other-org-activity", organization_id="hidden", owner_id="client-shared",
        participant_ids=["client-shared", "client-a", "client-b", "shared", "m1", "m2", "deleted", "guest"],
    )]}, {"2026-01-15": set(people) | {"deleted", "guest"}})

    result = service.analyze(NS(state=NS(user_id="test", user_role="超级管理员")), PrincipalQuery(
        organization_id=organization_id, date_from=date(2026, 1, 1), date_to=date(2026, 1, 31), breakdown=picks,
    ))

    assert result["summary"]["活动案主次数"] == 1
    assert result["summary"]["活动参与者次数"] == expected_participants
    assert result["summary"]["活动参与次数"] == 1 + expected_participants
    assert result["summary"]["课程数"] == 0
    totals = result["breakdown"]["participation"]["totals"]
    assert totals["count"] == (1 if picks else 1 + expected_participants)
    assert totals["people"] == (1 if picks else 1 + expected_participants)
    assert result["items"] == []
    assert "other-org-activity" not in json.dumps(result)
    assert {row["id"] for row in result["breakdown"]["participation"]["members"]} <= {"client-shared", "client-a", "client-b"}


def test_unavailable_organization_is_rejected_before_member_aggregation(monkeypatch):
    monkeypatch.setattr(service, "collect_data", lambda _: ([], {}, [], []))
    monkeypatch.setattr(service, "_member_participation_breakdown", lambda *_: pytest.fail("越权组织不应统计"))
    with pytest.raises(HTTPException) as error:
        service.analyze(NS(), PrincipalQuery(organization_id="hidden"))
    assert error.value.status_code == 403


@pytest.mark.parametrize("referrer_mode", ["member", "selected", "all"])
def test_participation_uses_activity_dates_for_all_historical_referred_clients_and_shares_detail_export(
    monkeypatch, referrer_mode,
):
    people = {cid: NS(id=cid, nickname=name, name="", referrer=referrer, referral_date=day)
              for cid, name, referrer, day in (
                  ("ref", "所属引流人", "", ""), ("other-ref", "其他引流人", "", ""),
                  ("old", "历史客户", "所属引流人", "2025-01-01"),
                  ("new", "本期客户", "所属引流人", "2026-01-10"),
                  ("undated", "未填引流日期客户", "所属引流人", ""),
                  ("other", "其他范围客户", "其他引流人", "2026-01-01"),
                  ("unassigned", "未配置引流人", "", "2026-01-01"),
              )}
    org = NS(id="org", name="所选组织", member_ids=["ref"], referrer_mode=referrer_mode,
             referrer_ids=["ref"], include_unassigned_referrers=False)
    permissions = {"principal_scope": "all", "customer_access": {"transaction_access": "none"}}
    monkeypatch.setattr(service, "collect_data", lambda *_a, **_kw: ([org], permissions, [], []))
    monkeypatch.setattr(service, "scope", lambda _: ([org], people, permissions))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: list(people.values()))
    monkeypatch.setattr(service.visit_service, "list_basic_visits", lambda _: [])
    install_activities(monkeypatch, {"gcs": [
        activity(id="start", date="2026-01-01", owner_id="old", participant_ids=["new", "ref", "unassigned", "other"]),
        activity(id="end", date="2026-01-31", owner_id="new", participant_ids=["old", "undated"]),
        activity(id="before", date="2025-12-31", owner_id="old"),
        activity(id="after", date="2026-02-01", owner_id="old"),
        activity(id="absent", date="2026-01-16", owner_id="old"),
    ]}, {day: set(people) for day in ("2025-12-31", "2026-01-01", "2026-01-31", "2026-02-01")})
    request = NS(state=NS(user_id="test", user_role="超级管理员"))
    query = PrincipalQuery(organization_id="org", date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
    result = service.analyze(request, query)
    expected_ids = {"old", "new", "undated"} | ({"other"} if referrer_mode == "all" else set())
    participation = result["breakdown"]["participation"]
    assert {row["id"] for row in participation["members"]} == expected_ids
    assert result["summary"]["活动参与次数"] == participation["overall"]["count"] == (6 if referrer_mode == "all" else 5)
    assert participation["overall"]["people"] == len(expected_ids)
    assert result["summary"]["引流人数"] == (2 if referrer_mode == "all" else 1)
    old = next(row for row in participation["members"] if row["id"] == "old")
    assert {row["date"] for row in old["activities"]} == {"2026-01-01", "2026-01-31"}
    pc = detail_page(result["breakdown"], query.model_copy(update={"overview_detail": "participation"}))
    mini = mobile_result(result, query.model_copy(update={"mobile_group": "participation"}))
    assert {row["id"] for row in pc["items"]} == {row["id"] for row in mini["items"]} == expected_ids
    assert sum(row["count"] for row in pc["items"]) == result["summary"]["活动参与次数"]
    monkeypatch.setattr(principal_api, "audit", lambda *_a, **_kw: None)
    monkeypatch.setattr(principal_api, "_xlsx_response", lambda _sheet, headers, rows, filename, **kw:
                        {"headers": headers, "rows": rows, **kw})
    exported = principal_api.export(query.model_copy(update={"export_group": "participation"}), request)
    assert len(exported["rows"]) == result["summary"]["活动参与次数"]
    assert {row[0] for row in exported["rows"]} == {people[cid].nickname for cid in expected_ids}
    assert "不限制引流日期" in result["notice"]


@pytest.fixture
def participation_people(monkeypatch):
    install_activities(monkeypatch, {
        "gcs": [activity(id="a1", owner_id="m1", participant_ids=["m2", "m3"]),
                activity(id="a2", owner_id="m2", participant_ids=["m1"])],
        "ers": [activity(id="a3", owner_id="m1", participant_ids=["m2"])],
    }, {"2026-01-15": {"m1", "m2", "m3"}})
    return {cid: NS(id=cid, nickname="同名" if cid in {"m1", "m2"} else "成员三", name="")
            for cid in ("m1", "m2", "m3")}


def test_participation_breakdown_counts_unique_people_across_types_roles_and_same_names(participation_people):
    result = service._member_participation_breakdown(set(participation_people), "2026-01-01", "2026-01-31", participation_people)

    assert result["overall"] == result["totals"] == {
        "count": 7, "owner_count": 3, "participant_count": 4,
        "people": 3, "owner_people": 2, "participant_people": 3,
    }
    assert [(item["key"], item["count"], item["owner_count"], item["participant_count"])
            for item in result["by_type"]] == [("gcs", 5, 2, 3), ("ers", 2, 1, 1)]
    assert [(item["key"], item["label"], item["count"]) for item in result["by_participant"]] == [
        ("m1", "同名", 3), ("m2", "同名", 3), ("m3", "成员三", 1),
    ]


def test_participation_filters_intersect_but_each_dropdown_preserves_its_own_options(participation_people):
    result = service._member_participation_breakdown(
        set(participation_people), "2026-01-01", "2026-01-31", participation_people,
        ["participation_type:ers", "participation_person:m1"],
    )

    assert result["overall"]["count"] == 7
    assert result["totals"] == {"count": 1, "owner_count": 1, "participant_count": 0,
                                "people": 1, "owner_people": 1, "participant_people": 0}
    # 活动类型选项按已选人员统计；人员选项按已选活动类型统计。
    assert [(item["key"], item["count"]) for item in result["by_type"]] == [("gcs", 2), ("ers", 1)]
    assert [(item["key"], item["owner_count"], item["participant_count"])
            for item in result["by_participant"]] == [("m1", 1, 0), ("m2", 0, 1)]


def test_same_person_in_two_roles_is_one_person_in_filtered_summary(participation_people):
    result = service._member_participation_breakdown(
        set(participation_people), "2026-01-01", "2026-01-31", participation_people,
        ["participation_type:gcs", "participation_person:m1"],
    )
    assert result["totals"] == {"count": 2, "owner_count": 1, "participant_count": 1,
                                "people": 1, "owner_people": 1, "participant_people": 1}


@pytest.mark.parametrize("picks", [["participation_type:unknown"], ["participation_person:outsider"]])
def test_unmatched_participation_filters_return_zero_people_and_times(participation_people, picks):
    result = service._member_participation_breakdown(
        set(participation_people), "2026-01-01", "2026-01-31", participation_people, picks,
    )
    assert result["overall"]["count"] == 7
    assert result["totals"] == {"count": 0, "owner_count": 0, "participant_count": 0,
                                "people": 0, "owner_people": 0, "participant_people": 0}


@pytest.fixture
def salon_people(monkeypatch):
    monkeypatch.setattr(service.organization_service, "list_organizations", lambda: [
        NS(id="a", name="甲组织", member_ids=[]), NS(id="b", name="乙组织", member_ids=["teacher"]),
    ])
    monkeypatch.setattr(course_service, "list_courses", lambda: [
        NS(id="book-a", organization_id="a"), NS(id="bowl-a", organization_id="a"),
        NS(id="book-b", organization_id="b"),
    ])
    monkeypatch.setattr(course_type_service, "list_course_types", lambda: [])
    install_activities(monkeypatch, {
        "class": [
            activity(course_id="book-a", course_name="读书会", course_type="读书会", activity_name="《当下的力量》", teacher_ids=["teacher"], participant_ids=["m1", "m2"]),
            activity(course_id="book-a", course_name="读书会", course_type="读书会", participant_ids=["m1"]),
            activity(course_id="bowl-a", course_name="颂钵", course_type="颂钵", participant_ids=["m2", "m3"]),
            activity(course_id="book-b", course_name="读书会", course_type="读书会", participant_ids=["m1"]),
        ],
        "ics": [activity(participant_ids=["m3"])],
    }, {"2026-01-15": {"m1", "m2", "m3"}})
    return {cid: NS(id=cid, nickname=cid, name="") for cid in ("m1", "m2", "m3")}


def test_salon_subtypes_count_course_types_and_split_same_type_by_organization(salon_people):
    result = service._member_participation_breakdown(set(salon_people), "2026-01-01", "2026-01-31", salon_people)
    salon = next(item for item in result["by_type"] if item["key"] == "class")

    assert salon["count"] == 6 and salon["owner_count"] == 0
    # 《当下的力量》是某一场的活动名，二级统计按沙龙类型合并，不单列这场。
    assert [(item["key"], item["count"], item["people"]) for item in salon["subtypes"]] == [
        ("读书会｜甲组织", 3, 2), ("颂钵｜甲组织", 2, 2), ("读书会｜乙组织", 1, 1),
    ]
    assert all("当下的力量" not in item["key"] for item in salon["subtypes"])
    assert all(item["owner_count"] == item["owner_people"] == 0 for item in salon["subtypes"])


def test_salon_course_and_person_filters_intersect_and_options_remain_linked(salon_people):
    result = service._member_participation_breakdown(
        set(salon_people), "2026-01-01", "2026-01-31", salon_people,
        ["participation_type:class", "participation_course:读书会｜甲组织", "participation_person:m1"],
    )
    assert result["overall"]["count"] == 7
    assert result["totals"] == {"count": 2, "owner_count": 0, "participant_count": 2,
                                "people": 1, "owner_people": 0, "participant_people": 1}
    assert [(item["key"], item["count"]) for item in result["by_participant"]] == [("m1", 2), ("m2", 1)]
    salon = next(item for item in result["by_type"] if item["key"] == "class")
    assert {item["key"]: item["count"] for item in salon["subtypes"]} == {
        "读书会｜甲组织": 2, "读书会｜乙组织": 1,
    }


def test_salon_course_filter_does_not_match_other_organizations_or_other_types(salon_people):
    result = service._member_participation_breakdown(
        set(salon_people), "2026-01-01", "2026-01-31", salon_people,
        ["participation_type:class", "participation_course:读书会｜乙组织"],
    )
    assert result["totals"]["count"] == result["totals"]["people"] == 1
    assert [item["key"] for item in result["by_participant"]] == ["m1"]

    invalid = service._member_participation_breakdown(
        set(salon_people), "2026-01-01", "2026-01-31", salon_people,
        ["participation_type:ics", "participation_course:读书会｜乙组织"],
    )
    assert invalid["totals"]["count"] == 0


def test_salon_detail_uses_course_type_instead_of_the_session_title(monkeypatch):
    monkeypatch.setattr(service.organization_service, "list_organizations", lambda: [
        NS(id="a", name="甲组织", member_ids=[]),
    ])
    monkeypatch.setattr(course_service, "list_courses", lambda: [NS(id="book", organization_id="a")])
    monkeypatch.setattr(course_type_service, "list_course_types", lambda: [])
    people = {"m1": NS(id="m1", nickname="成员", name="")}
    install_activities(monkeypatch, {
        "class": [
            activity(course_id="book", course_name="读书会", course_type="读书会",
                     activity_name="《当下的力量》", participant_ids=["m1"]),
            activity(course_id="book", course_name="呼吸禅茶", course_type="呼吸禅茶", participant_ids=["m1"]),
            activity(course_id="book", course_name="未填类型", course_type="  ", participant_ids=["m1"]),
        ],
        "gcs": [activity(name="觉醒一场", owner_id="m1")],
    }, {"2026-01-15": {"m1"}})

    page = detail_page(
        {"participation": service._member_participation_breakdown(set(people), "2026-01-01", "2026-01-31", people)},
        PrincipalQuery(overview_detail="participation"),
    )
    assert {(record["name"], record["subtype"]) for record in page["items"][0]["activities"]} == {
        ("《当下的力量》", "读书会"), ("呼吸禅茶", "呼吸禅茶"), ("未填类型", "未分类"), ("觉醒一场", ""),
    }


def test_member_activity_details_are_sorted_by_total_count_and_paginated_by_person(monkeypatch):
    people = {cid: NS(id=cid, nickname=cid, name="") for cid in ("m1", "m2", "m3")}
    install_activities(monkeypatch, {
        "gcs": [activity(id="a1", date="2026-01-10", name="觉醒主题甲", owner_id="m1", participant_ids=["m2", "outsider"], description="不应下发的个案内容"),
                activity(id="a2", date="2026-01-20", name="觉醒主题乙", owner_id="m2", participant_ids=["m1"])],
        "ers": [activity(id="a3", date="2026-01-21", name="情绪主题", owner_id="m2", participant_ids=["m3"])],
    }, {day: {"m1", "m2", "m3", "outsider"} for day in ("2026-01-10", "2026-01-20", "2026-01-21")})
    participation = service._member_participation_breakdown(set(people), "2026-01-01", "2026-01-31", people)
    query = PrincipalQuery(overview_detail="participation", page_size=2)
    result = detail_page({"participation": participation}, query)

    assert result["total"] == 3 and result["total_pages"] == 2
    assert [(row["id"], row["count"]) for row in result["items"]] == [("m2", 3), ("m1", 2)]
    first = result["items"][0]
    assert first["owner_count"] == 2 and first["participant_count"] == 1
    assert [(record["date"], record["name"], record["role"]) for record in first["activities"]] == [
        ("2026-01-21", "情绪主题", "案主"),
        ("2026-01-20", "觉醒主题乙", "案主"),
        ("2026-01-10", "觉醒主题甲", "参与者"),
    ]
    assert all(set(record) == {"date", "name", "type", "subtype", "role", "teachers"} for record in first["activities"])
    assert all(record["subtype"] == "" for record in first["activities"])
    assert "不应下发的个案内容" not in json.dumps(result, ensure_ascii=False)
    query.page = 2
    assert [(row["id"], row["count"]) for row in detail_page({"participation": participation}, query)["items"]] == [("m3", 1)]


def test_participation_detail_filters_match_salon_course_and_member_summary(salon_people):
    picks = ["participation_type:class", "participation_course:读书会｜甲组织"]
    participation = service._member_participation_breakdown(
        set(salon_people), "2026-01-01", "2026-01-31", salon_people, picks,
    )
    query = PrincipalQuery(overview_detail="participation", detail_picks=picks)
    result = detail_page({"participation": participation}, query)
    assert [(row["id"], row["count"]) for row in result["items"]] == [("m1", 2), ("m2", 1)]
    assert sum(row["count"] for row in result["items"]) == participation["totals"]["count"]
    assert {(record["name"], record["subtype"]) for row in result["items"] for record in row["activities"]} == {
        ("《当下的力量》", "读书会"), ("读书会", "读书会"),
    }
    assert all(record["role"] == "参与者" for row in result["items"] for record in row["activities"])
    query.detail_picks = [*picks, "participation_person:m3"]
    assert detail_page({"participation": participation}, query)["total"] == 0
    # 未传独立明细筛选时，沿用当前经营概况筛选。
    query.detail_picks = []
    query.breakdown = [*picks, "participation_person:m2"]
    assert detail_page({"participation": participation}, query)["items"][0]["count"] == 1


def test_compact_participation_summary_does_not_send_member_activity_history(participation_people):
    participation = service._member_participation_breakdown(set(participation_people), "2026-01-01", "2026-01-31", participation_people)
    compact = compact_breakdown({"participation": participation})
    assert "members" not in compact["participation"]
    assert compact["participation"]["totals"] == participation["totals"]
    assert participation["members"] and participation["members"][0]["activities"]


def test_activity_details_resolve_recorded_teachers_outside_member_or_referral_scope(monkeypatch):
    people = {"m1": NS(id="m1", nickname="成员甲", name="", service_teacher="无关服务老师")}
    teachers = [NS(id="t1", nickname="老师甲", name="姓名甲"), NS(id="t2", nickname="", name="老师乙")]
    loads = []

    def directory():
        loads.append(True)
        return [*people.values(), *teachers]

    monkeypatch.setattr(service.customer_service, "list_customers", directory)
    install_activities(monkeypatch, {
        "gcs": [activity(id="with-teachers", owner_id="m1", teacher_ids=["t2", "missing", "t1", "t1"]),
                activity(id="same-teachers", owner_id="m1", teacher_ids=["t1", "t2"]),
                activity(id="no-teachers", owner_id="m1")],
    }, {"2026-01-15": {"m1"}})
    result = service._member_participation_breakdown(set(people), "2026-01-01", "2026-01-31", people)
    page = detail_page({"participation": result}, PrincipalQuery(overview_detail="participation"))
    assert [record["teachers"] for record in page["items"][0]["activities"]] == ["老师甲、老师乙", "老师甲、老师乙", ""]
    assert len(loads) == 1
    assert "无关服务老师" not in json.dumps(page, ensure_ascii=False)
    compact = compact_breakdown({"participation": result})
    assert "members" not in compact["participation"]
