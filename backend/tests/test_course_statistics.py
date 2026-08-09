from datetime import datetime, timezone
from types import SimpleNamespace


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
    }
    data.update(overrides)
    return SimpleNamespace(**data)


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
    }
    assert by_type["gcs"] == {
        "type": "gcs",
        "label": "觉醒游戏",
        "course_count": 1,
        "class_hours": 1,
        "participant_count": 1,
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
        "daily_need": "放松减压",
        "daily_transaction_amount": 1200,
        "closers": "老师甲",
    }
    assert participants["leader-1"]["identity_group"] == "老人"
    assert participants["leader-1"]["participation_role"] == "组长"

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

    assert energy_result["statistics"] == [{
        "type": "eks",
        "label": "能量结",
        "course_count": 1,
        "class_hours": 4,
        "participant_count": 1,
    }]
    assert energy_result["trend"][0]["class_hours"] == 4
    assert energy_result["teacher_statistics"][0]["class_hours"] == 4
    assert energy_result["courses"][0]["class_hours"] == 4
