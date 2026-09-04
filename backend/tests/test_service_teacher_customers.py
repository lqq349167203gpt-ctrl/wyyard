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
            updated_at=now - timedelta(days=5),
        ),
        SimpleNamespace(
            visit_id="v2",
            created_by_id="account-pan",
            created_by="潘潘",
            category="customer_info",
            updated_at=now - timedelta(days=2),
        ),
        SimpleNamespace(
            visit_id="v2",
            created_by_id="account-ting",
            created_by="婷婷",
            category="visit_need",
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

    assert result["summary"] == {"total": 2, "active_30": 1, "inactive_30": 1}
    assert result["total"] == 1
    assert result["items"][0]["id"] == "c2"
    assert result["items"][0]["last_follow_up_category"] == "来访需求"


def test_available_teachers_includes_current_account_owner():
    teachers = service_teacher_customer_service.available_teachers(
        [_customer("c1", "婷婷"), _customer("c2", "潘潘")],
        "娟娟",
    )

    assert teachers == ["娟娟", "婷婷", "潘潘"]
