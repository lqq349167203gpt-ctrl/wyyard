"""日报与课表同源回归：日期、五类来源、客户范围和退课。"""

import asyncio
from datetime import date
from types import SimpleNamespace as NS

import pytest

from app.api import class_records, daily_report
from app.services import (
    emotional_release_session_service,
    energy_knot_session_service,
    group_case_session_service,
    internal_course_session_service,
    space_service,
)


@pytest.mark.parametrize("mobile", [False, True])
def test_report_reads_same_five_day_sources_as_schedule(monkeypatch, mobile):
    people = [NS(id="a", nickname="可见客户"), NS(id="hidden", nickname="不可见客户"), NS(id="teacher", nickname="老师")]
    monkeypatch.setattr(class_records, "list_all_customers", lambda: people)
    monkeypatch.setattr(class_records, "_visible_customer_ids", lambda _: {"a"})
    monkeypatch.setattr(space_service, "get_all_spaces", lambda: [])
    monkeypatch.setattr(class_records.activity_participant_note_service, "completed_customer_ids", lambda *_: pytest.fail("日报不需要统计课程信息填写数"))
    modules = [class_records.class_record_service, group_case_session_service,
               emotional_release_session_service, energy_knot_session_service, internal_course_session_service]
    calls = []

    def read(day, source):
        calls.append((source, day))
        data = {"id": "same", "date": day, "space_id": "space-a", "room_id": "", "owner_id": "",
                "host_id": "", "achiever_id": "", "teacher_ids": ["teacher"],
                "participant_ids": ["a", "hidden", "teacher"], "groups": [],
                "withdrawn_participant_ids": ["a"] if day == "2026-10-02" else [],
                "course_name": "", "name": source + day, "start_time": "09:00", "end_time": "10:00"}
        return [NS(**data, model_dump=lambda **_: dict(data))]

    for index, module in enumerate(modules):
        method = "list_records" if index == 0 else "list_sessions"
        monkeypatch.setattr(module, method, lambda day, source=str(index): read(day, source))

    async def visits(**kwargs):
        assert kwargs["space_id"] == "space-a"
        return [{"id": kwargs["date"]}]

    async def directory(_):
        return [{"id": "a", "nickname": "可见客户"}]

    monkeypatch.setattr(daily_report.visits, "list_visits", visits)
    monkeypatch.setattr(daily_report.customers, "list_customers_light", directory)
    monkeypatch.setattr(daily_report.member_identity_service, "list_identities", lambda: [])
    monkeypatch.setattr(daily_report.customer_access_service, "transaction_access", lambda _: "none")
    # 日报不经过完整 dashboard，避免重新扫描历史日历及读取分组/邀约。
    monkeypatch.setattr(class_records, "dashboard", lambda **_: pytest.fail("日报不能请求完整课表"))

    for day in [date(2026, 10, 1), date(2026, 10, 2)]:
        report = asyncio.run(daily_report.read_report(NS(state=NS()), day, mobile, "space-a"))
        assert report["date"] == day.isoformat()
        assert report["visits"] == [{"id": day.isoformat()}]
        assert len(report["activities"]) == len({row["id"] for row in report["activities"]}) == 5
        for row in report["activities"]:
            assert row["date"] == day.isoformat()
            assert row["course_name"].endswith(day.isoformat())
            assert row["teacher_names"] == ["老师"]
            assert row["participant_ids"] == (["a"] if day.day == 1 else [])
            assert row["groups"] == []
    assert len(calls) == 10


def test_report_activity_name_prefers_entered_name_and_sorts_by_time():
    result = daily_report.report_activities({
        "class_records": [{"id": "a", "activity_name": "实际名称", "course_name": "默认读书会", "start_time": "18:00"}],
        "gcs_sessions": [{"id": "a", "name": "游戏", "start_time": "09:00"}],
        "ers_sessions": [], "eks_sessions": [], "ics_sessions": [],
    })
    assert [row["course_name"] for row in result] == ["游戏", "实际名称"]
    assert result[0]["id"] != result[1]["id"]
