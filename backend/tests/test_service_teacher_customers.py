from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services import service_teacher_customer_service


def _customer(customer_id: str, teacher: str):
    return SimpleNamespace(
        id=customer_id,
        nickname=f"客户{customer_id}",
        name="",
        member_type="普通会员",
        follow_up_status="前期沟通中",
        service_teacher=teacher,
    )


def test_teacher_follow_up_only_counts_notes_written_by_selected_teacher(monkeypatch):
    now = datetime.now(timezone.utc)
    customers = [_customer("c1", "婷婷"), _customer("c2", "婷婷"), _customer("c3", "潘潘")]
    visits = [
        SimpleNamespace(id="v1", customer_id="c1"),
        SimpleNamespace(id="v2", customer_id="c2"),
        SimpleNamespace(id="v3", customer_id="c3"),
    ]
    notes = [
        SimpleNamespace(
            visit_id="v1",
            created_by_id="account-ting",
            created_by="婷婷",
            category="follow_up",
            content="最近的跟进点",
            updated_at=now - timedelta(days=5),
        ),
        SimpleNamespace(
            visit_id="v2",
            created_by_id="account-pan",
            created_by="潘潘",
            category="customer_info",
            content="其他老师填写的客户信息",
            updated_at=now - timedelta(days=2),
        ),
        SimpleNamespace(
            visit_id="v2",
            created_by_id="account-ting",
            created_by="婷婷",
            category="visit_need",
            content="较早的来访需求",
            updated_at=now - timedelta(days=45),
        ),
    ]
    monkeypatch.setattr(
        service_teacher_customer_service.account_service,
        "list_accounts",
        lambda: [
            SimpleNamespace(id="account-ting", owner="婷婷", username="tingting"),
            SimpleNamespace(id="account-pan", owner="潘潘", username="panpan"),
        ],
    )
    monkeypatch.setattr(
        service_teacher_customer_service.visit_service,
        "list_basic_visits",
        lambda customer_ids: [visit for visit in visits if visit.customer_id in customer_ids],
    )
    monkeypatch.setattr(
        service_teacher_customer_service.visit_note_service,
        "list_notes",
        lambda visit_ids: [note for note in notes if note.visit_id in set(visit_ids)],
    )

    result = service_teacher_customer_service.list_teacher_customers(
        customers,
        "婷婷",
        follow_up_filter="inactive_30",
    )

    assert result["summary"] == {
        "total": 2, "active": 1, "inactive": 1, "active_30": 1, "inactive_30": 1,
    }
    assert result["total"] == 1
    assert result["items"][0]["id"] == "c2"
    assert result["items"][0]["last_follow_up_category"] == ""
    assert result["items"][0]["latest_customer_info_content"] == ""


def test_follow_up_definition_filters_each_note_category_independently(monkeypatch):
    now = datetime.now(timezone.utc)
    customers = [_customer("c1", "婷婷"), _customer("c2", "婷婷")]
    visits = [
        SimpleNamespace(id="v1", customer_id="c1"),
        SimpleNamespace(id="v2", customer_id="c2"),
    ]
    notes = [
        SimpleNamespace(
            visit_id="v1",
            created_by_id="account-ting",
            created_by="婷婷",
            category="customer_info",
            content="客户一最近的客户信息",
            updated_at=now - timedelta(days=3),
        ),
        SimpleNamespace(
            visit_id="v1",
            created_by_id="account-ting",
            created_by="婷婷",
            category="follow_up",
            content="客户一较早的跟进点",
            updated_at=now - timedelta(days=35),
        ),
        SimpleNamespace(
            visit_id="v2",
            created_by_id="account-ting",
            created_by="婷婷",
            category="follow_up",
            content="客户二最近的跟进点",
            updated_at=now - timedelta(days=2),
        ),
    ]
    monkeypatch.setattr(
        service_teacher_customer_service.account_service,
        "list_accounts",
        lambda: [SimpleNamespace(id="account-ting", owner="婷婷", username="tingting")],
    )
    monkeypatch.setattr(
        service_teacher_customer_service.visit_service,
        "list_basic_visits",
        lambda customer_ids: [visit for visit in visits if visit.customer_id in customer_ids],
    )
    monkeypatch.setattr(
        service_teacher_customer_service.visit_note_service,
        "list_notes",
        lambda visit_ids: [note for note in notes if note.visit_id in set(visit_ids)],
    )

    customer_info_result = service_teacher_customer_service.list_teacher_customers(
        customers,
        "婷婷",
        follow_up_filter="inactive_30",
        follow_up_definition="customer_info",
    )
    follow_up_result = service_teacher_customer_service.list_teacher_customers(
        customers,
        "婷婷",
        follow_up_filter="inactive_30",
        follow_up_definition="follow_up",
    )
    both_result = service_teacher_customer_service.list_teacher_customers(
        customers,
        "婷婷",
        follow_up_filter="inactive_30",
        follow_up_definition="both",
    )

    assert customer_info_result["summary"] == {
        "total": 2, "active": 1, "inactive": 1, "active_30": 1, "inactive_30": 1,
    }
    assert [item["id"] for item in customer_info_result["items"]] == ["c2"]
    assert [item["id"] for item in follow_up_result["items"]] == ["c1"]
    assert follow_up_result["items"][0]["latest_customer_info_content"] == "客户一最近的客户信息"
    assert follow_up_result["items"][0]["latest_customer_info_by"] == "婷婷"
    assert follow_up_result["items"][0]["latest_follow_up_content"] == "客户一较早的跟进点"
    assert follow_up_result["items"][0]["latest_follow_up_by"] == "婷婷"
    assert both_result["summary"] == {
        "total": 2, "active": 0, "inactive": 2, "active_30": 0, "inactive_30": 2,
    }
    assert {item["id"] for item in both_result["items"]} == {"c1", "c2"}

    unrestricted_result = service_teacher_customer_service.list_teacher_customers(
        customers,
        "婷婷",
        follow_up_filter="active",
        follow_up_definition="none",
        follow_up_days=4,
    )
    assert unrestricted_result["follow_up_days"] == 4
    assert unrestricted_result["summary"]["active"] == 2
    assert {item["id"] for item in unrestricted_result["items"]} == {"c1", "c2"}


def test_available_teachers_includes_current_account_owner():
    teachers = service_teacher_customer_service.available_teachers(
        [_customer("c1", "婷婷"), _customer("c2", "潘潘")],
        "娟娟",
    )

    assert teachers == ["娟娟", "婷婷", "潘潘"]


def test_teacher_options_prefers_customer_with_course_teacher_position():
    customers = [
        SimpleNamespace(id="ordinary", nickname="婷婷", name="", positions=[]),
        SimpleNamespace(id="teacher", nickname="婷婷", name="", positions=["课程老师"]),
        SimpleNamespace(id="pan", nickname="", name="潘潘", positions=["成就君"]),
    ]

    options = service_teacher_customer_service.teacher_options(["婷婷", "潘潘", "未关联"], customers)

    assert options == [
        {"name": "婷婷", "customer_id": "teacher"},
        {"name": "潘潘", "customer_id": "pan"},
        {"name": "未关联", "customer_id": ""},
    ]
