from datetime import datetime, timezone
from types import SimpleNamespace

import pytest


def test_coarse_customer_index_uses_active_direct_course_links(monkeypatch):
    from app.services import project_deduction_service as service

    def deduction(customer_id="c1", **changes):
        fields = dict(customer_id=customer_id, project_type="membership-cards", project_name="粗门次卡",
                      source_activity_type="class", source_activity_id="course-1",
                      is_deleted=False, cancelled=False)
        return SimpleNamespace(**(fields | changes))

    records = [deduction(), deduction(), deduction("c2"),
               deduction("c3", source_activity_type="gcs"),
               deduction("cancelled", cancelled=True), deduction("deleted", is_deleted=True),
               deduction("other", project_name="60次卡"), deduction("unlinked", source_activity_id=""),
               deduction("wrong-product", project_type="other-projects")]
    monkeypatch.setattr(service, "_deductions", {str(i): record for i, record in enumerate(records)})
    monkeypatch.setattr(service, "_fill_current_remaining", lambda _: pytest.fail("只读名单不得计算余额"))
    assert service.coarse_customer_ids_by_activity() == {
        ("class", "course-1"): {"c1", "c2"}, ("gcs", "course-1"): {"c3"},
    }


@pytest.mark.parametrize("access,mobile_view", [("detail", ""), ("summary", "courses"), ("none", "")])
def test_course_coarse_customers_respect_course_and_customer_permissions(monkeypatch, access, mobile_view):
    from starlette.requests import Request

    from app.api import statistics

    activities = {"class": [_activity(id="same-id"), _activity(id="other-id")],
                  "gcs": [_activity(id="same-id")]}
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", tuple(
        (kind, kind, lambda kind=kind, **_: activities[kind]) for kind in activities
    ))
    customers = [SimpleNamespace(id=cid, nickname=name, name="", member_type="", positions=[])
                 for cid, name in [("teacher-1", "老师"), ("c1", "小甲"), ("c2", "小乙"), ("secret", "不可见")]]
    monkeypatch.setattr(statistics.customer_service, "list_customers", lambda: customers)
    monkeypatch.setattr(statistics.organization_service, "list_organizations", lambda: [])
    monkeypatch.setattr(statistics.course_service, "list_courses", lambda: [])
    monkeypatch.setattr(statistics.course_type_service, "list_course_types", lambda: [])
    monkeypatch.setattr(statistics.member_identity_service, "list_identities", lambda: [])
    monkeypatch.setattr(statistics, "_course_participant_ids", lambda *_: {"c1", "c2"})
    monkeypatch.setattr(statistics, "_course_customer_daily_context", lambda *_: ({}, {}, {}))
    monkeypatch.setattr(statistics, "_payment_record_groups", lambda: [])
    monkeypatch.setattr(statistics, "get_request_roles", lambda _: ["测试角色"])
    monkeypatch.setattr(statistics.position_edit_permission_service, "get_permissions", lambda _: {"course_records": "all"})
    monkeypatch.setattr(statistics.customer_access_service, "transaction_access", lambda _: access)
    monkeypatch.setattr(statistics.customer_access_service, "visible_customer_ids", lambda *_: {"teacher-1", "c1", "c2"})
    seen = []

    def coarse_index():
        seen.append(True)
        return {("class", "same-id"): {"c1", "secret"}, ("gcs", "same-id"): {"c2"}}

    monkeypatch.setattr(statistics.project_deduction_service, "coarse_customer_ids_by_activity", coarse_index)
    request = Request({"type": "http", "path": "/api/statistics/courses", "headers": []})
    result = statistics.get_course_statistics(date_from="2026-08-01", date_to="2026-08-31",
        organization_id=None, activity_type="all", teacher_id=None, mobile_view=mobile_view, request=request)
    by_id = {course["id"]: course for course in result["courses"]}
    assert by_id["class:same-id"]["coarse_customers"] == ([{"id": "c1", "nickname": "小甲"}] if access != "none" else [])
    assert by_id["gcs:same-id"]["coarse_customers"] == ([{"id": "c2", "nickname": "小乙"}] if access != "none" else [])
    assert by_id["class:other-id"]["coarse_customers"] == []
    assert len(seen) == (0 if access == "none" else 1)


def _activity(**overrides):
    data = {
        "id": "activity-1",
        "date": "2026-08-01",
        "created_at": datetime(2026, 8, 1, tzinfo=timezone.utc),
        "membership_deduction_count": 1,
        "teacher_ids": ["teacher-1"],
        "participant_ids": ["participant-1"],
        "owner_id": "",
        "host_id": "",
        "achiever_id": "",
        "course_id": "",
        "course_name": "",
        "course_type": "",
        "activity_name": "",
        "name": "",
        "start_time": "10:00",
        "end_time": "12:00",
        "groups": [],
        "withdrawn_participant_ids": [],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.parametrize("mobile_view", ["", "courses", "reviews", "participants_source"])
def test_course_attendance_counts_exclude_absent_but_keep_roster(monkeypatch, mobile_view):
    from app.api import statistics

    roster = ["arrived", "leader", "absent", "missing", "deleted", "other-day"]
    salon = _activity(participant_ids=roster + ["withdrawn", "teacher-1"],
                      withdrawn_participant_ids=["withdrawn"], course_type="测试沙龙",
                      course_review="复盘", groups=[SimpleNamespace(leader_id="leader", deputy_id="", member_ids=[])])
    sessions = {kind: [_activity(id=kind, participant_ids=["arrived", "absent"],
                                 owner_id="owner-present" if kind == "gcs" else "owner-absent",
                                 course_review="复盘", description="[]")]
                for kind in ("gcs", "ers", "eks")}
    activities = {"class": [salon], **sessions}
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", tuple(
        (kind, kind, lambda kind=kind, **_: activities[kind]) for kind in activities
    ))
    customers = [SimpleNamespace(id=cid, nickname=cid, name="", positions=["课程老师"] if cid == "teacher-1" else [],
                                member_type="体验会员" if cid in {"arrived", "absent"} else "正式会员")
                 for cid in roster + ["teacher-1", "withdrawn", "owner-present", "owner-absent"]]
    monkeypatch.setattr(statistics.customer_service, "list_customers", lambda: customers)
    monkeypatch.setattr(statistics.organization_service, "list_organizations", lambda: [])
    monkeypatch.setattr(statistics.course_service, "list_courses", lambda: [])
    monkeypatch.setattr(statistics.course_type_service, "list_course_types", lambda: [])
    monkeypatch.setattr(statistics.member_identity_service, "list_identities", lambda: [
        SimpleNamespace(name="体验会员", type="新人"), SimpleNamespace(name="正式会员", type="老人")])
    monkeypatch.setattr(statistics, "_course_customer_daily_context", lambda *_: ({}, {}, {}))
    monkeypatch.setattr(statistics, "_payment_record_groups", lambda: [])
    # 重复已到店邀约不能重复计数；已删邀约和其他日期的到店不能计入本堂课。
    visits = [SimpleNamespace(customer_id=cid, visit_date="2026-08-01", arrived=True, is_deleted=False)
              for cid in ("arrived", "arrived", "leader", "owner-present", "withdrawn")]
    visits += [SimpleNamespace(customer_id="absent", visit_date="2026-08-01", arrived=False, is_deleted=False),
               SimpleNamespace(customer_id="deleted", visit_date="2026-08-01", arrived=True, is_deleted=True),
               SimpleNamespace(customer_id="other-day", visit_date="2026-08-02", arrived=True, is_deleted=False)]
    monkeypatch.setattr(statistics.visit_service, "_visits", {str(i): visit for i, visit in enumerate(visits)})
    result = statistics.get_course_statistics(date_from="2026-08-01", date_to="2026-08-02",
        activity_type="all", organization_id=None, teacher_id=None, mobile_view=mobile_view)
    salon_row = next(course for course in result["courses"] if course["activity_type"] == "class")
    assert (salon_row["participant_count"], salon_row["new_count"], salon_row["old_count"]) == (2, 1, 1)
    assert {p["id"] for p in salon_row["participants"]} == set(roster)
    assert {p["id"] for p in salon_row["participants"] if p["arrived"]} == {"arrived", "leader"}
    totals = {s["type"]: s for s in result["statistics"]}
    assert sum(s["participant_count"] for s in totals.values()) == 5
    assert totals["gcs"]["owner_count"] == 1
    assert totals["ers"]["owner_count"] == totals["eks"]["owner_count"] == 0
    if mobile_view in {"", "participants_source"}:
        assert {course["activity_type"]: course["owner_count"] for course in result["courses"]} == {
            "class": 0, "gcs": 1, "ers": 0, "eks": 0,
        }
    if not mobile_view:
        assert result["trend"][0]["participant_count"] == 5
        assert result["teacher_statistics"][0]["participant_count"] == 5
    if mobile_view in {"", "participants_source"}:
        owners = {course["activity_type"]: course["owner_participants"] for course in result["courses"]}
        assert owners["gcs"][0]["arrived"] is True
        assert owners["ers"][0]["arrived"] is False
    subtype_result = statistics.get_course_statistics(date_from="2026-08-01", date_to="2026-08-02",
        activity_type="class", organization_id=None, teacher_id=None, mobile_view=mobile_view)
    assert subtype_result["subtype_statistics"][0]["participant_count"] == 2


def test_course_statistics_counts_hours_and_participant_roles(monkeypatch):
    from app.api import statistics

    salon = _activity(
        id="salon-1",
        membership_deduction_count=2,
        course_id="course-1",
        course_name="呼吸禅茶",
        course_type="茶疗",
        groups=[SimpleNamespace(
            name="一组",
            member_ids=["participant-1"],
            leader_id="leader-1",
            deputy_id="",
        )],
    )
    awakening = _activity(
        id="gcs-1",
        start_time="09:00",
        participant_ids=["participant-1", "owner-1", "teacher-1", "host-1"],
        owner_id="owner-1",
        host_id="host-1",
    )
    teacher_payment = SimpleNamespace(
        price=1200,
        customer_id="participant-1",
        deal_date="2026-08-01",
        voided=False,
        closers=[{"id": "teacher-1", "name": "老师甲", "amount": 1200}],
        closer_id="teacher-1",
        closer_name="老师甲",
    )
    def empty_loader(**_kwargs):
        return []

    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("class", "沙龙活动", lambda **_kwargs: [salon]),
        ("gcs", "觉醒游戏", lambda **_kwargs: [awakening]),
        ("ers", "情绪释放", empty_loader),
        ("eks", "能量结", empty_loader),
        ("ics", "内部课程", empty_loader),
    ))
    monkeypatch.setattr(
        statistics.class_record_service,
        "_get_group_member_ids",
        lambda _record: {"participant-1", "leader-1"},
    )
    monkeypatch.setattr(
        statistics.organization_service,
        "list_organizations",
        lambda: [SimpleNamespace(id="org-1", name="无忧茶苑", member_ids=["teacher-1"])],
    )
    monkeypatch.setattr(
        statistics.course_service,
        "list_courses",
        lambda: [SimpleNamespace(id="course-1", name="呼吸禅茶", organization_id="org-1")],
    )
    monkeypatch.setattr(statistics.course_type_service, "list_course_types", lambda: [])
    monkeypatch.setattr(
        statistics.customer_service,
        "list_customers",
        lambda: [
            SimpleNamespace(
                id="teacher-1",
                nickname="老师甲",
                name="",
                member_type="",
                positions=["课程老师"],
            ),
            SimpleNamespace(
                id="teacher-2",
                nickname="老师乙",
                name="",
                member_type="",
                positions=["课程老师"],
            ),
            SimpleNamespace(
                id="participant-1",
                nickname="新人甲",
                name="",
                member_type="体验会员",
                positions=[],
            ),
            SimpleNamespace(
                id="leader-1",
                nickname="老人甲",
                name="",
                member_type="正式会员",
                positions=[],
            ),
        ],
    )
    monkeypatch.setattr(
        statistics.member_identity_service,
        "list_identities",
        lambda: [
            SimpleNamespace(name="体验会员", type="新人"),
            SimpleNamespace(name="正式会员", type="老人"),
        ],
    )
    monkeypatch.setattr(
        statistics.visit_service,
        "list_visits",
        lambda: [SimpleNamespace(
            visit_date="2026-08-01",
            customer_id="participant-1",
            needs="放松减压",
        )],
    )
    monkeypatch.setattr(statistics, "_payment_record_groups", lambda: [[teacher_payment]])
    monkeypatch.setattr(statistics.visit_service, "list_basic_visits", lambda: [
        SimpleNamespace(visit_date="2026-08-01", customer_id=customer_id, arrived=True)
        for customer_id in ("participant-1", "leader-1")
    ])

    result = statistics.get_course_statistics(
        date_from="2026-08-01",
        date_to="2026-08-31",
        granularity="day",
        organization_id="org-1",
        activity_type=None,
        teacher_id="teacher-1",
    )

    by_type = {item["type"]: item for item in result["statistics"]}
    assert by_type["class"] == {
        "type": "class",
        "label": "沙龙活动",
        "course_count": 1,
        "class_hours": 2,
        "participant_count": 2,
        "owner_count": 0,
    }
    assert by_type["gcs"] == {
        "type": "gcs",
        "label": "觉醒游戏",
        "course_count": 1,
        "class_hours": 1,
        "participant_count": 1,
        "owner_count": 0,
    }
    assert result["organizations"] == [{"id": "org-1", "name": "无忧茶苑"}]
    assert result["teachers"] == [{"id": "teacher-1", "name": "老师甲"}]
    assert result["trend"][0] == {
        "date": "2026-08-01",
        "course_count": 2,
        "class_hours": 3,
        "participant_count": 3,
        "transaction_amount": 1200,
    }
    assert result["trend"][-1] == {
        "date": "2026-08-31",
        "course_count": 0,
        "class_hours": 0,
        "participant_count": 0,
        "transaction_amount": 0,
    }
    assert result["teacher_statistics"] == [{
        "id": "teacher-1",
        "name": "老师甲",
        "course_count": 2,
        "class_hours": 3,
        "participant_count": 3,
        "transaction_amount": 1200,
    }]

    assert len(result["courses"]) == 2
    assert [item["id"] for item in result["courses"]] == ["class:salon-1", "gcs:gcs-1"]
    salon_row = next(item for item in result["courses"] if item["id"] == "class:salon-1")
    assert salon_row["name"] == "呼吸禅茶"
    assert salon_row["class_hours"] == 2
    assert salon_row["teachers"] == ["老师甲"]
    assert salon_row["participant_count"] == 2
    assert salon_row["new_count"] == 1
    assert salon_row["old_count"] == 1
    assert salon_row["daily_transaction_amount"] == 1200
    participants = {item["id"]: item for item in salon_row["participants"]}
    assert participants["participant-1"] == {
        "id": "participant-1",
        "nickname": "新人甲",
        "member_type": "体验会员",
        "identity_group": "新人",
        "participation_role": "参与者",
        "arrived": True,
        "daily_need": "放松减压",
        # 「参与者」页签用：当天的邀约备注（这条假数据里没有邀约 id 和备注）
        "daily_visit_id": "",
        "daily_customer_info": "",
        "daily_follow_up": "",
        "daily_transaction_amount": 1200,
        "closers": "老师甲",
    }
    assert participants["leader-1"]["identity_group"] == "老人"
    assert participants["leader-1"]["participation_role"] == "组长"

    salon.course_review = "课程复盘"
    mobile_page = statistics.get_course_statistics(
        date_from="2026-08-01", date_to="2026-08-31", granularity="day",
        organization_id="org-1", activity_type=None, teacher_id="teacher-1",
        mobile_view="courses", page=1, page_size=1,
    )
    assert mobile_page["total"] == 2
    assert len(mobile_page["courses"]) == 1
    assert "daily_need" not in mobile_page["courses"][0]["participants"][0]
    review_page = statistics.get_course_statistics(
        date_from="2026-08-01", date_to="2026-08-31", granularity="day",
        organization_id="org-1", activity_type=None, teacher_id="teacher-1",
        mobile_view="reviews", page=1, page_size=20,
    )
    assert review_page["total"] == 1
    assert review_page["courses"][0]["id"] == "class:salon-1"

    sound_salon = _activity(
        id="salon-2",
        membership_deduction_count=3,
        course_name="颂钵音疗",
        course_type="音疗",
    )
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("class", "沙龙活动", lambda **_kwargs: [salon, sound_salon]),
    ))
    monkeypatch.setattr(
        statistics.course_type_service,
        "list_course_types",
        lambda: [
            {"name": "茶疗", "organization_id": "org-1", "category": "salon"},
            {"name": "音疗", "organization_id": "org-1", "category": "salon"},
        ],
    )

    tea_result = statistics.get_course_statistics(
        date_from="2026-08-01",
        date_to="2026-08-31",
        granularity="day",
        organization_id="org-1",
        activity_type="class",
        course_subtype="茶疗",
        teacher_id="teacher-1",
    )

    assert tea_result["salon_subtype_statistics"] == [
        {"type": "茶疗", "label": "茶疗", "course_count": 1, "class_hours": 2, "participant_count": 2},
        {"type": "音疗", "label": "音疗", "course_count": 1, "class_hours": 3, "participant_count": 2},
    ]
    assert tea_result["subtype_statistics"] == tea_result["salon_subtype_statistics"]
    assert tea_result["trend"][0] == {
        "date": "2026-08-01",
        "course_count": 1,
        "class_hours": 2,
        "participant_count": 2,
        "transaction_amount": 1200,
    }
    assert [item["id"] for item in tea_result["courses"]] == ["class:salon-1"]
    assert tea_result["teacher_statistics"] == [{
        "id": "teacher-1",
        "name": "老师甲",
        "course_count": 1,
        "class_hours": 2,
        "participant_count": 2,
        "transaction_amount": 1200,
    }]

    healer_course = _activity(
        id="ics-1",
        course_type="疗愈师课程：自爱力构建",
        course_name="疗愈师课程",
        membership_deduction_count=0,
    )
    business_course = _activity(
        id="ics-2",
        course_type="商业框架陪跑",
        course_name="商业框架陪跑",
        membership_deduction_count=0,
    )
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("ics", "内部课程", lambda **_kwargs: [healer_course, business_course]),
    ))

    internal_result = statistics.get_course_statistics(
        date_from="2026-08-01",
        date_to="2026-08-31",
        granularity="day",
        organization_id=None,
        activity_type="ics",
        course_subtype="商业框架陪跑",
        teacher_id="teacher-1",
    )

    assert internal_result["subtype_statistics"] == [
        {"type": "疗愈师课程", "label": "疗愈师课程", "course_count": 1, "class_hours": 0, "participant_count": 1},
        {"type": "商业框架陪跑", "label": "商业框架陪跑", "course_count": 1, "class_hours": 0, "participant_count": 1},
        {"type": "落地赋能班", "label": "落地赋能班", "course_count": 0, "class_hours": 0, "participant_count": 0},
    ]
    assert internal_result["statistics"] == [{
        "type": "ics",
        "label": "内部课程",
        "course_count": 1,
        "class_hours": 0,
        "participant_count": 1,
        "owner_count": 0,
    }]
    assert [item["id"] for item in internal_result["courses"]] == ["ics:ics-2"]
    assert internal_result["trend"][0]["course_count"] == 1
    assert internal_result["teacher_statistics"][0]["course_count"] == 1

    energy_knot = _activity(
        id="eks-1",
        membership_deduction_count=0,
        owner_id="owner-1",
        participant_ids=["participant-1"],
        description='[{"id":"","name":"","count":4}]',
    )
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("eks", "能量结", lambda **_kwargs: [energy_knot]),
    ))

    energy_result = statistics.get_course_statistics(
        date_from="2026-08-01",
        date_to="2026-08-31",
        granularity="day",
        organization_id=None,
        activity_type="eks",
        course_subtype=None,
        teacher_id="teacher-1",
    )

    # 能量结没有课时，只结算部位数：课时一律为 0，部位数单独出列
    assert energy_result["statistics"] == [{
        "type": "eks",
        "label": "能量结",
        "course_count": 1,
        "class_hours": 0,
        "participant_count": 1,
        "owner_count": 0,
    }]
    assert energy_result["trend"][0]["class_hours"] == 0
    assert energy_result["teacher_statistics"][0]["class_hours"] == 0
    assert energy_result["courses"][0]["class_hours"] == 0
    assert energy_result["courses"][0]["body_part_count"] == 4

    # 全部时间跨课程类型按授课 ID 匹配，同名或其他老师的课程不能混入。
    sources = []
    for kind in ("class", "gcs", "ers", "eks", "ics"):
        taught = _activity(id=f"{kind}-taught", date="2025-01-02", description="[]")
        other = _activity(id=f"{kind}-other", teacher_ids=["teacher-2"], description="[]")
        sources.append((kind, kind, lambda taught=taught, other=other: [taught, other]))
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", tuple(sources))
    all_result = statistics.get_course_statistics(
        all_dates=True, activity_type="all", teacher_id="teacher-1",
        organization_id=None, course_subtype=None, granularity="month",
    )
    assert {row["id"] for row in all_result["courses"]} == {
        f"{kind}:{kind}-taught" for kind in ("class", "gcs", "ers", "eks", "ics")
    }


def test_course_owners_include_emotional_release_and_multiple_energy_owners():
    from app.api.statistics import _course_owner_details

    customers = {"a": SimpleNamespace(nickname="小安"), "b": SimpleNamespace(nickname="小白")}
    for activity_type in ("gcs", "ers"):
        result = _course_owner_details(activity_type, _activity(owner_id="a"), customers, {"a"})
        assert result == {"owner_name": "小安", "body_part_count": None, "owner_count": 1}
    activity = _activity(owner_id="a", description='[{"id":"a","count":2},{"id":"b","count":3}]')
    assert _course_owner_details("eks", activity, customers, {"a", "b"}) == {
        "owner_name": "小安、小白", "body_part_count": 5, "owner_count": 2,
    }
    assert _course_owner_details("eks", activity, customers, {"a"})["owner_name"] == "小安"


def test_course_statistics_limits_records_to_actor_when_scope_is_own(monkeypatch):
    """角色选择“与本人相关”时只返回本人授课的课程。"""
    from starlette.requests import Request

    from app.api import statistics

    own_activity = _activity(id="salon-own", teacher_ids=["teacher-1"])
    other_activity = _activity(id="salon-other", teacher_ids=["teacher-2"])
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("class", "沙龙活动", lambda **_kwargs: [own_activity, other_activity]),
    ))
    monkeypatch.setattr(
        statistics.customer_service,
        "list_customers",
        lambda: [
            SimpleNamespace(id="teacher-1", nickname="老师甲", name="", positions=["课程老师"]),
            SimpleNamespace(id="teacher-2", nickname="老师乙", name="", positions=["课程老师"]),
            SimpleNamespace(id="participant-1", nickname="参与者", name="", positions=[]),
        ],
    )
    monkeypatch.setattr(statistics.organization_service, "list_organizations", lambda: [])
    monkeypatch.setattr(statistics.member_identity_service, "list_identities", lambda: [])
    monkeypatch.setattr(statistics.visit_service, "list_visits", lambda **_kwargs: [])
    monkeypatch.setattr(statistics.class_record_service, "_get_group_member_ids", lambda _record: set())
    monkeypatch.setattr(statistics, "_payment_record_groups", lambda: [])
    monkeypatch.setattr(
        statistics.customer_access_service,
        "visible_customer_ids",
        lambda _request, customers: {customer.id for customer in customers},
    )
    monkeypatch.setattr(statistics, "get_request_roles", lambda _request: ["超级管理员"])
    monkeypatch.setattr(
        statistics,
        "position_edit_permission_service",
        SimpleNamespace(get_permissions=lambda _roles: {"course_records": "own"}),
    )
    monkeypatch.setattr(statistics, "request_actor_customer_ids", lambda _request: {"teacher-1"})

    request = Request({"type": "http", "path": "/api/statistics/courses", "headers": []})
    result = statistics.get_course_statistics(
        date_from="2026-08-01",
        date_to="2026-08-31",
        granularity="day",
        organization_id=None,
        activity_type=None,
        course_subtype=None,
        teacher_id="",
        request=request,
    )

    assert [row["id"] for row in result["courses"]] == ["class:salon-own"]
    assert [teacher["id"] for teacher in result["teachers"]] == ["teacher-1"]


def test_course_statistics_returns_no_records_when_actor_has_no_customer(monkeypatch):
    """“与本人相关”但账号归属人没有对应客户时，不应回退到全部记录。"""
    from starlette.requests import Request

    from app.api import statistics

    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("class", "沙龙活动", lambda **_kwargs: [_activity(id="salon-1", teacher_ids=["teacher-1"])]),
    ))
    monkeypatch.setattr(statistics.customer_service, "list_customers", lambda: [])
    monkeypatch.setattr(statistics.organization_service, "list_organizations", lambda: [])
    monkeypatch.setattr(statistics.member_identity_service, "list_identities", lambda: [])
    monkeypatch.setattr(statistics.visit_service, "list_visits", lambda **_kwargs: [])
    monkeypatch.setattr(statistics, "_payment_record_groups", lambda: [])
    monkeypatch.setattr(statistics, "get_request_roles", lambda _request: ["超级管理员"])
    monkeypatch.setattr(
        statistics,
        "position_edit_permission_service",
        SimpleNamespace(get_permissions=lambda _roles: {"course_records": "own"}),
    )
    monkeypatch.setattr(statistics, "request_actor_customer_ids", lambda _request: set())

    request = Request({"type": "http", "path": "/api/statistics/courses", "headers": []})
    result = statistics.get_course_statistics(
        date_from="2026-08-01",
        date_to="2026-08-31",
        granularity="day",
        organization_id=None,
        activity_type=None,
        course_subtype=None,
        teacher_id="",
        request=request,
    )

    assert result["courses"] == []
