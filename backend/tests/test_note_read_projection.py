"""邀约与课表共用备注：批量读取的语义、权限和扫描次数回归。"""

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from app.api import class_records, visits
from app.models.activity_participant_note import ActivityParticipantNote
from app.models.class_record import ClassRecord
from app.models.group_case_session import GroupCaseSession
from app.models.visit import VisitRecord
from app.models.visit_note import VisitNote
from app.services import (
    account_service,
    activity_participant_note_service,
    daily_customer_note_service,
    emotional_release_session_service,
    energy_knot_session_service,
    group_case_session_service,
    internal_course_session_service,
    space_service,
    visit_note_service,
    visit_service,
)

DAY = "2026-10-11"
NOW = datetime(2026, 10, 11, tzinfo=timezone.utc)


def visit(visit_id, customer_id, **fields):
    return VisitRecord(
        id=visit_id, customer_id=customer_id, visit_date=DAY,
        created_at=NOW, updated_at=NOW, **fields,
    )


def activity_note(note_id, customer_id, category, **fields):
    return ActivityParticipantNote(
        id=note_id, customer_id=customer_id, category=category,
        activity_source="class_record", session_id="other-course",
        activity_date=DAY, content="课程记录", created_by="本人", created_by_id="me",
        created_at=NOW, updated_at=NOW, **fields,
    )


def visit_note(note_id, visit_id, category, **fields):
    return VisitNote(
        id=note_id, visit_id=visit_id, category=category,
        content="邀约记录", created_by="别人", created_by_id="other",
        created_at=NOW, updated_at=NOW, **fields,
    )


def test_day_completion_matches_course_projection_without_building_text_or_writing(monkeypatch):
    ids = set("abcdefgh")
    rows = [
        visit("a", "a"), visit("b", "b", cancelled=True),
        visit("c", "c", is_deleted=True),
        visit("d", "d", feedback="旧深度需求", healing_notes="旧跟进点"),
        visit("e", "e"),
    ]
    course_notes = [
        activity_note("a-info", "a", "customer_info"),
        activity_note("b-follow", "b", "follow_up"),
        activity_note("f-info", "f", "customer_info"),
        activity_note("f-follow", "f", "follow_up"),
        activity_note("g-info", "g", "customer_info"),
        activity_note("g-follow", "g", "follow_up", is_deleted=True),
        activity_note("h-info", "h", "customer_info"),
        activity_note("h-follow", "h", "follow_up").model_copy(update={"activity_date": "2026-10-10"}),
    ]
    visit_notes = [
        visit_note("a-follow", "a", "follow_up"),
        visit_note("b-info", "b", "customer_info"),
        visit_note("c-info", "c", "customer_info"), visit_note("c-follow", "c", "follow_up"),
        visit_note("e-need", "e", "visit_need"), visit_note("e-feedback", "e", "customer_feedback"),
    ]
    monkeypatch.setattr(visit_service, "_visits", {row.id: row for row in rows})
    monkeypatch.setattr(activity_participant_note_service, "_notes", {note.id: note for note in course_notes})
    monkeypatch.setattr(visit_note_service, "_notes", {note.id: note for note in visit_notes})
    monkeypatch.setattr(visit_note_service, "_save", lambda _: None)
    monkeypatch.setattr(visit_note_service, "_sync_visit_cache", lambda *_: None)
    monkeypatch.setattr(daily_customer_note_service, "course_context", lambda *_: SimpleNamespace(
        date=DAY, participant_ids=list(ids), course_name="当天课程",
    ))

    def forbidden(*_args, **_kwargs):
        raise AssertionError("完成数不应创建投影正文或写入历史备注")

    with monkeypatch.context() as read_only:
        read_only.setattr(daily_customer_note_service, "as_course_note", forbidden)
        read_only.setattr(visit_note_service, "ensure_legacy_entries", forbidden)
        completed = activity_participant_note_service.completed_customer_ids_for_day(DAY, ids)
    assert completed == {"a", "d", "f"}
    for source in ("class_record", "group_case", "emotional_release", "energy_knot", "internal_course"):
        assert activity_participant_note_service.completed_customer_ids(source, source) == completed


def test_day_courses_batches_counts_and_keeps_owner_withdrawal_and_visibility_rules(monkeypatch):
    common = {"date": DAY, "created_at": NOW, "updated_at": NOW}
    course = ClassRecord(
        id="course", course_id="type", course_name="课程", participant_ids=["a", "b", "hidden", "teacher"],
        teacher_ids=["teacher"], withdrawn_participant_ids=["b"], **common,
    )
    group_case = GroupCaseSession(
        id="case", owner_id="owner", owner_name="案主", participant_ids=["a"], **common,
    )
    withdrawn_owner = group_case.model_copy(update={"id": "withdrawn-case", "withdrawn_participant_ids": ["owner"]})
    monkeypatch.setattr(class_records.class_record_service, "list_records", lambda _: [course])
    monkeypatch.setattr(group_case_session_service, "list_sessions", lambda _: [group_case, withdrawn_owner])
    for service in (emotional_release_session_service, energy_knot_session_service, internal_course_session_service):
        monkeypatch.setattr(service, "list_sessions", lambda _: [])
    monkeypatch.setattr(space_service, "get_all_spaces", lambda: [])
    monkeypatch.setattr(class_records, "list_all_customers", lambda: [
        SimpleNamespace(id=customer_id, nickname=customer_id) for customer_id in ("a", "b", "hidden", "teacher", "owner")
    ])
    monkeypatch.setattr(class_records, "_visible_customer_ids", lambda _: {"a", "b", "teacher", "owner"})
    calls = []

    def completed(day, customer_ids):
        calls.append((day, customer_ids))
        return {"owner", "b"}

    monkeypatch.setattr(activity_participant_note_service, "completed_customer_ids_for_day", completed)
    result, _ = class_records.read_day_courses(DAY)
    assert calls == [(DAY, {"a", "owner"})]
    assert result["class_records"][0]["participant_note_total_count"] == 1
    assert result["class_records"][0]["participant_note_completed_count"] == 0
    assert result["gcs_sessions"][0]["participant_note_total_count"] == 2
    assert result["gcs_sessions"][0]["participant_note_completed_count"] == 1
    assert result["gcs_sessions"][1]["participant_note_total_count"] == 1
    assert result["gcs_sessions"][1]["participant_note_completed_count"] == 0
    calls.clear()
    class_records.read_day_courses(DAY, include_note_counts=False)
    assert calls == []


@pytest.mark.parametrize("can_view_need", [False, True])
def test_visit_list_reuses_projection_and_keeps_summary_permissions_and_order(monkeypatch, can_view_need):
    record = visit("v", "a")
    hidden_record = visit("hidden", "hidden")
    projected = activity_note("course-info", "a", "customer_info")
    notes = [
        visit_note("need", "v", "visit_need"),
        visit_note("info", "v", "customer_info").model_copy(update={"created_at": NOW + timedelta(seconds=2)}),
        visit_note("follow", "v", "follow_up"),
    ]
    monkeypatch.setattr(visit_service, "_visits", {"v": record, "hidden": hidden_record})
    monkeypatch.setattr(activity_participant_note_service, "_notes", {projected.id: projected})
    monkeypatch.setattr(visit_note_service, "_notes", {note.id: note for note in notes})
    monkeypatch.setattr(visit_service, "list_visits", lambda *_: [record, hidden_record])
    monkeypatch.setattr(visits, "_visible_customer_ids", lambda _: {"a"})
    monkeypatch.setattr(visits, "get_customer", lambda _: SimpleNamespace(nickname="可见客户", member_type="次卡", referrer=""))
    monkeypatch.setattr(visit_service, "first_arrival_dates", lambda _: {})
    monkeypatch.setattr(account_service, "get_account", lambda _: SimpleNamespace(roles=["员工"], role="员工"))
    monkeypatch.setattr(visits.customer_access_service, "can_view_detail_tab", lambda *_: can_view_need)
    monkeypatch.setattr(visits.customer_access_service, "can_view_transaction_summary", lambda *_: False)
    projection_calls = []
    original = visit_note_service.list_notes

    def projected_notes(visit_ids, ensure_legacy=True):
        projection_calls.append((set(visit_ids), ensure_legacy))
        return original(visit_ids, ensure_legacy)

    monkeypatch.setattr(visit_note_service, "list_notes", projected_notes)
    request = SimpleNamespace(state=SimpleNamespace(
        user_id="me", user_owner="本人", user_name="account", user_role="员工",
    ))
    rows = asyncio.run(visits.list_visits(date=DAY, page=None, page_size=None, request=request))
    assert projection_calls == [({"v"}, False)]
    assert len(rows) == 1
    row = rows[0]
    assert row["needs"] == ("别人：邀约记录" if can_view_need else "")
    assert row["feedback"] == "别人：邀约记录\n本人：课程记录"
    assert row["healing_notes"] == "别人：邀约记录"
    note_rows = row["visit_notes"]
    assert note_rows[0]["id"] == "info"
    assert any(note["id"] == "need" for note in note_rows) is can_view_need
    own_note = next(note for note in note_rows if note["id"].startswith("course-note|"))
    assert own_note["can_edit"] is True and own_note["can_delete"] is True
    assert next(note for note in note_rows if note["id"] == "info")["can_edit"] is False


def test_visit_projection_only_reads_selected_active_visits(monkeypatch):
    rows = [visit("active", "a"), visit("cancelled", "a", cancelled=True), visit("deleted", "a", is_deleted=True)]
    monkeypatch.setattr(visit_service, "_visits", {row.id: row for row in rows})
    notes = [
        activity_note("today", "a", "customer_info"),
        activity_note("deleted-note", "a", "follow_up", is_deleted=True),
        activity_note("other-customer", "b", "customer_info"),
        activity_note("old-day", "a", "follow_up").model_copy(update={"activity_date": "2026-10-10"}),
    ]
    monkeypatch.setattr(activity_participant_note_service, "_notes", {note.id: note for note in notes})

    def forbidden(*_args, **_kwargs):
        raise AssertionError("已知邀约 ID 不应再次扫描全部邀约")

    monkeypatch.setattr(visit_service, "list_basic_visits", forbidden)
    projected = daily_customer_note_service.for_visits({"active", "cancelled", "deleted", "missing"})
    assert [note.id for note in projected] == ["course-note|active|today"]


def test_light_visit_list_filters_customer_scope_before_one_note_read(monkeypatch):
    record = visit("visible", "a")
    monkeypatch.setattr(visit_service, "list_visits_light", lambda *_: [
        record.model_dump(mode="json"), visit("hidden", "hidden").model_dump(mode="json"),
    ])
    monkeypatch.setattr(visits, "_visible_customer_ids", lambda _: {"a"})
    monkeypatch.setattr(visit_service, "first_arrival_dates", lambda _: {})
    monkeypatch.setattr(account_service, "get_account", lambda _: None)
    monkeypatch.setattr(visits.customer_access_service, "can_view_detail_tab", lambda *_: False)
    calls = []

    def projection(visit_ids, ensure_legacy=True):
        calls.append((set(visit_ids), ensure_legacy))
        return [visit_note("info", "visible", "customer_info"), visit_note("need", "visible", "visit_need")]

    monkeypatch.setattr(visit_note_service, "list_notes", projection)
    request = SimpleNamespace(state=SimpleNamespace(user_id="me"))
    rows = asyncio.run(visits.list_visits_light(date=DAY, request=request))
    assert calls == [({"visible"}, True)]
    assert len(rows) == 1 and rows[0]["id"] == "visible"
    assert rows[0]["needs"] == ""
    assert rows[0]["feedback"] == "别人：邀约记录"
