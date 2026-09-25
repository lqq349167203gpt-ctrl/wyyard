from datetime import datetime
from types import SimpleNamespace

from app.services import missing_check_service


def _class_record(**overrides):
    data = dict(
        id="cr1",
        date="2026-09-15",
        start_time="14:00",
        end_time="16:00",
        course_name="读书会",
        activity_name="",
        course_type="读书会",
        course_description="每周读书会",
        course_review="",
        teacher_ids=["t1"],
        participant_ids=["c1"],
        withdrawn_participant_ids=[],
        groups=[],
        is_public_welfare=False,
        is_published=True,
        activity_mode="线下",
        membership_deduction_count=1,
        space_id="sp1",
        created_by="潘潘",
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _visit(visit_id: str, customer_id: str, **overrides):
    data = dict(
        id=visit_id,
        customer_id=customer_id,
        visit_date="2026-09-15",
        visit_time="09:00",
        needs="想了解课程",
        feedback="做电商客服",
        healing_notes="三天后回访",
        referrer_handler="潘潘",
        receptionist="沁桐",
        goal="体验课程",
        is_leader=False,
        sort_order=0,
        created_at=datetime(2026, 9, 15, 8, 0),
        arrived=True,
        arrival_time="09:05",
        space_id="sp1",
        cancelled=False,
        is_deleted=False,
        created_by="潘潘",
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _customers():
    return [
        SimpleNamespace(id="c1", nickname="小安", name="", member_type="月卡"),
        SimpleNamespace(id="c2", nickname="小七", name="", member_type=""),
        SimpleNamespace(id="t1", nickname="婷婷", name="", member_type=""),
    ]


def _patch_activities(monkeypatch, records):
    """把课表的五类活动服务收敛到给定的沙龙记录。"""
    from app.services import (
        class_record_service,
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        internal_course_session_service,
    )

    def by_date(date=None):
        if not date:
            return records
        return [record for record in records if getattr(record, "date", "") == date]

    monkeypatch.setattr(class_record_service, "list_records", by_date)
    for service in (
        group_case_session_service,
        emotional_release_session_service,
        energy_knot_session_service,
        internal_course_session_service,
    ):
        monkeypatch.setattr(service, "list_sessions", lambda date=None: [])


def _patch_customers(monkeypatch, customers=None):
    from app.services import customer_service

    monkeypatch.setattr(customer_service, "list_customers", lambda: customers or _customers())


def _patch_visits(monkeypatch, visits):
    from app.services import visit_service

    def by_date(date=None, customer_id=None, space_id=None):
        if not date:
            return visits
        return [visit for visit in visits if getattr(visit, "visit_date", "") == date]

    monkeypatch.setattr(
        visit_service,
        "list_visits",
        by_date,
    )


def _course_block(monkeypatch, records, kinds):
    _patch_customers(monkeypatch)
    _patch_activities(monkeypatch, records)
    result = missing_check_service.check(
        start_date="2026-09-15",
        end_date="2026-09-15",
        space_id="sp1",
        scopes=("course",),
        kinds=kinds,
    )
    return result["days"][0]["course"]


def _visit_block(monkeypatch, visits, kinds, *, can_view_need=True):
    _patch_customers(monkeypatch)
    _patch_visits(monkeypatch, visits)
    result = missing_check_service.check(
        start_date="2026-09-15",
        end_date="2026-09-15",
        space_id="sp1",
        scopes=("visit",),
        kinds=kinds,
        can_view_visit_need=can_view_need,
    )
    return result["days"][0]["visit"]


def test_course_rows_carry_detail_and_only_report_selected_kinds(monkeypatch):
    """核对页要能看见每条活动的具体内容，缺失项只按勾选的来报。"""
    course = _course_block(
        monkeypatch,
        [_class_record(teacher_ids=[], start_time="")],
        {"course_teacher", "course_time"},
    )

    row = course["rows"][0]
    assert row["kinds"] == ["course_teacher", "course_time"]
    assert row["title"] == "读书会"
    assert row["type_label"] == "读书会"
    assert row["intro"] == "每周读书会"
    assert row["participant_names"] == ["小安"]
    assert row["creator"] == "潘潘"
    assert row["activity_mode"] == "线下"
    assert course["missing_count"] == 1
    assert course["total"] == 1

    # 没勾「未发布」就不报；勾了才报
    without_publish = _course_block(monkeypatch, [_class_record(is_published=False)], {"course_teacher"})
    assert without_publish["rows"][0]["kinds"] == []
    with_publish = _course_block(monkeypatch, [_class_record(is_published=False)], {"course_publish"})
    assert with_publish["rows"][0]["kinds"] == ["course_publish"]


def test_course_rows_resolve_teacher_names(monkeypatch):
    """老师用姓名展示，方便核对人是否填对。"""
    course = _course_block(monkeypatch, [_class_record()], {"course_teacher"})

    row = course["rows"][0]
    assert row["teacher_names"] == ["婷婷"]
    assert row["teacher_ids"] == ["t1"]
    assert row["kinds"] == []


def test_energy_knot_intro_is_not_the_body_parts_json(monkeypatch):
    """能量结的 description 是部位 JSON，简介只取 course_description，不能把 JSON 显示成简介。"""
    from app.services import energy_knot_session_service

    _patch_customers(monkeypatch)
    _patch_activities(monkeypatch, [])
    session = SimpleNamespace(
        id="eks1",
        date="2026-09-15",
        start_time="19:30",
        end_time="",
        name="能量结",
        owner_id="c1",
        owner_name="小安",
        description='[{"id":"","name":"","count":1}]',
        course_description="",
        course_review="",
        teacher_ids=["t1"],
        participant_ids=[],
        withdrawn_participant_ids=[],
        groups=[],
        is_published=False,
        membership_deduction_count=0,
        space_id="sp1",
        activity_mode="线下",
        created_by="潘潘",
        created_by_id="acct1",
    )
    monkeypatch.setattr(energy_knot_session_service, "list_sessions", lambda date=None: [session])

    result = missing_check_service.check(
        start_date="2026-09-15",
        end_date="2026-09-15",
        space_id="sp1",
        scopes=("course",),
        kinds={"course_intro", "course_body_parts"},
    )

    row = result["days"][0]["course"]["rows"][0]
    assert row["intro"] == ""
    assert row["body_parts"] == 1
    assert row["kinds"] == ["course_intro"]  # 部位有值，不报；简介为空才报


def test_visit_rows_include_content_and_leader_state(monkeypatch):
    """邀约：逐条给出填写的具体内容；上方没有组长要报；已取消的不参与核对。"""
    visit = _visit_block(
        monkeypatch,
        [
            _visit("v1", "c2", sort_order=1, needs="", goal=""),
            _visit("v2", "c1", sort_order=2, is_leader=True),
            _visit("v3", "c1", sort_order=3, visit_time="", goal=""),
            _visit("v4", "c1", sort_order=4, cancelled=True),
        ],
        {"visit_time", "visit_leader", "visit_goal", "visit_needs"},
    )

    rows = {row["id"]: row for row in visit["rows"]}
    assert set(rows) == {"v1", "v2", "v3", "v4"}  # 已取消的 v4 仍然列出（可恢复）
    assert rows["v4"]["cancelled"] is True
    assert rows["v4"]["kinds"] == []  # 已取消的不算缺失
    assert rows["v1"]["kinds"] == ["visit_needs", "visit_goal", "visit_leader"]
    assert rows["v3"]["kinds"] == ["visit_time", "visit_goal"]
    assert rows["v2"]["kinds"] == []
    assert rows["v2"]["has_leader"] is True
    assert rows["v2"]["leader_name"] == "小安"
    assert rows["v3"]["leader_name"] == "小安"
    assert rows["v1"]["leader_name"] == ""
    assert rows["v2"]["needs"] == "想了解课程"
    assert rows["v2"]["customer_info"] == "做电商客服"
    assert rows["v2"]["follow_up"] == "三天后回访"
    assert rows["v2"]["inviter"] == "潘潘"
    assert rows["v2"]["receptionist"] == "沁桐"
    assert rows["v2"]["member_type"] == "月卡"
    assert visit["total"] == 4


def test_visit_need_content_hidden_without_permission(monkeypatch):
    """没有跟进点查看权限时：只核对是否填写，不返回来访需求内容。"""
    visit = _visit_block(monkeypatch, [_visit("v1", "c1")], {"visit_needs"}, can_view_need=False)

    row = visit["rows"][0]
    assert row["needs"] == ""
    assert row["needs_hidden"] is True
    assert row["has_needs"] is True
    assert row["kinds"] == []  # 已经填过，不算缺失


def test_empty_kinds_only_returns_rows_and_lock_status(monkeypatch):
    """一项都不勾时仍然返回当天全部记录与核对状态，只是不标缺失。"""
    course = _course_block(monkeypatch, [_class_record(teacher_ids=[], start_time="")], set())

    assert course["rows"][0]["kinds"] == []
    assert course["missing_count"] == 0
    assert course["total"] == 1


def test_empty_day_reported_only_when_the_check_is_selected(monkeypatch):
    """没有记录的天照样列出来（核对按天走）；「当天没有活动」是可选项，勾了才额外标出来。"""
    _patch_customers(monkeypatch)
    _patch_activities(monkeypatch, [])

    without_check = missing_check_service.check(
        start_date="2026-09-15",
        end_date="2026-09-15",
        space_id="sp1",
        scopes=("course",),
        kinds={"course_teacher"},
    )
    assert [day["date"] for day in without_check["days"]] == ["2026-09-15"]
    assert without_check["days"][0]["course"]["total"] == 0
    assert without_check["days"][0]["course"]["day_kinds"] == []
    assert without_check["days"][0]["missing_count"] == 0

    with_check = missing_check_service.check(
        start_date="2026-09-15",
        end_date="2026-09-15",
        space_id="sp1",
        scopes=("course",),
        kinds={"course_empty_day"},
    )
    day = with_check["days"][0]
    assert day["course"]["day_kinds"] == ["course_empty_day"]
    assert day["missing_count"] == 1


def test_unchecked_days_count_course_lock_and_visit_verification(monkeypatch):
    """课表锁与邀约核对各自独立：任意一边没核对，这一天就算未核对。"""
    from app.services import activity_theme_service, visit_verification_service

    _patch_customers(monkeypatch)
    _patch_activities(monkeypatch, [_class_record()])
    _patch_visits(monkeypatch, [_visit("v1", "c1")])
    monkeypatch.setattr(
        activity_theme_service,
        "get_theme_for_scope",
        lambda date, space_id="": SimpleNamespace(is_locked=True, locked_by="潘潘", locked_at=None),
    )
    monkeypatch.setattr(
        visit_verification_service,
        "get_verification",
        lambda date, space_id="": SimpleNamespace(is_verified=False, verified_by="", verified_at=None),
    )

    result = missing_check_service.check(
        start_date="2026-09-15",
        end_date="2026-09-15",
        space_id="sp1",
        scopes=("course", "visit"),
        kinds=set(),
    )

    day = result["days"][0]
    assert day["course"]["locked"] is True
    assert day["visit"]["verified"] is False
    assert day["unchecked"] is True
    assert result["summary"]["unchecked_day_count"] == 1


def test_check_only_counts_from_lock_start_date(monkeypatch):
    """核对只从 2026-07-01 起算：之前的历史数据既不显示也不要求核对。"""
    _patch_customers(monkeypatch)
    _patch_activities(monkeypatch, [
        _class_record(id="cr-june", date="2026-06-30"),
        _class_record(id="cr-july", date="2026-07-01"),
    ])

    result = missing_check_service.check(
        start_date="",
        end_date="2026-07-02",
        space_id="sp1",
        scopes=("course",),
        kinds=set(),
    )

    assert result["start_date"] == missing_check_service.LOCK_START_DATE
    assert result["lock_start_date"] == "2026-07-01"
    # 每一天都会列出来（含没有记录的 7/2），但 6/30 的记录不出现
    assert [day["date"] for day in result["days"]] == ["2026-07-02", "2026-07-01"]
    july_rows = next(day for day in result["days"] if day["date"] == "2026-07-01")["course"]["rows"]
    assert [row["id"] for row in july_rows] == ["class:cr-july"]
    assert not any(day["date"] < "2026-07-01" for day in result["days"])

    # 区间整个落在 7/1 之前：不返回任何一天
    before = missing_check_service.check(
        start_date="2026-06-01",
        end_date="2026-06-30",
        space_id="sp1",
        scopes=("course",),
        kinds=set(),
    )
    assert before["days"] == []
    assert before["summary"]["unchecked_day_count"] == 0


def test_check_clamps_range_start_and_end(monkeypatch):
    """起算日之前、今天之后都不参与核对。"""
    from datetime import date as date_type

    _patch_customers(monkeypatch)
    _patch_activities(monkeypatch, [_class_record(date="2099-12-31")])

    result = missing_check_service.check(
        start_date="2026-01-01",
        end_date="2099-12-31",
        space_id="sp1",
        scopes=("course",),
        kinds=set(),
    )

    today = date_type.today().isoformat()
    assert result["start_date"] == "2026-07-01"
    assert result["end_date"] == today
    assert all("2026-07-01" <= day["date"] <= today for day in result["days"])
    assert not any(day["date"] > today for day in result["days"])


def test_default_kinds_match_confirmed_defaults():
    """默认勾选：课表不勾简介/复盘/发布，邀约只勾昵称和时间。"""
    defaults = set(missing_check_service.default_kinds())
    assert {"course_intro", "course_review", "course_publish"} & defaults == set()
    assert {"course_teacher", "course_time"} <= defaults
    assert {"visit_nickname", "visit_time"} <= defaults
    assert {"visit_needs", "visit_inviter", "visit_receptionist"} & defaults == set()


def test_audit_check_endpoint_returns_rows_and_defaults(client, monkeypatch):
    from app.services import activity_theme_service, customer_access_service

    _patch_customers(monkeypatch)
    _patch_activities(monkeypatch, [_class_record(teacher_ids=[])])
    monkeypatch.setattr(
        activity_theme_service,
        "get_theme_for_scope",
        lambda date, space_id="": SimpleNamespace(is_locked=False, locked_by="", locked_at=None),
    )
    monkeypatch.setattr(customer_access_service, "visible_customer_ids", lambda request, customers: None)

    response = client.get(
        "/api/audit-check",
        params={"start_date": "2026-09-15", "end_date": "2026-09-15", "space_id": "sp1", "scope": "course"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scopes"] == ["course"]
    assert payload["kinds"] == sorted(missing_check_service.default_kinds_for(("course",)))
    assert payload["summary"]["unchecked_day_count"] == 1
    row = payload["days"][0]["course"]["rows"][0]
    assert row["kinds"] == ["course_teacher"]
    assert row["title"] == "读书会"


def test_audit_check_filters_status_before_pagination(client, monkeypatch):
    from app.services import customer_access_service

    monkeypatch.setattr(customer_access_service, "visible_customer_ids", lambda request, customers: None)
    monkeypatch.setattr(
        missing_check_service,
        "check",
        lambda **kwargs: {
            "days": [
                {"date": "2026-09-20", "course": {"locked": True}, "visit": {"verified": False}},
                {"date": "2026-09-19", "course": {"locked": False}, "visit": {"verified": True}},
                {"date": "2026-09-18", "course": {"locked": True}, "visit": {"verified": False}},
                {"date": "2026-09-17", "course": {"locked": False}, "visit": {"verified": True}},
            ],
            "summary": {"day_count": 4, "unchecked_day_count": 2},
        },
    )

    response = client.get(
        "/api/audit-check",
        params={
            "start_date": "2026-09-17", "end_date": "2026-09-20",
            "scope": "course", "status": "unchecked", "page_size": 1, "page": 2,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_days"] == 2
    assert payload["total_pages"] == 2
    assert [day["date"] for day in payload["days"]] == ["2026-09-17"]
    assert payload["summary"]["day_count"] == 4

    visit_response = client.get(
        "/api/audit-check",
        params={
            "start_date": "2026-09-17", "end_date": "2026-09-20",
            "scope": "visit", "status": "checked", "page_size": 1, "page": 1,
        },
    )
    assert visit_response.status_code == 200
    assert visit_response.json()["days"][0]["date"] == "2026-09-19"


def test_audit_catalog_marks_defaults(client):
    response = client.get("/api/audit-check/catalog")

    assert response.status_code == 200
    payload = response.json()
    items = {item["key"]: item for item in payload["items"]}
    assert items["course_intro"]["default"] is False
    assert items["course_teacher"]["default"] is True
    assert items["visit_needs"]["scope"] == "visit"
