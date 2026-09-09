from types import SimpleNamespace

from app.api import customers


def test_count_transactions_including_zero_amount_and_coarse_offsets(monkeypatch):
    sources = (
        (customers.membership_card_service, "list_cards"),
        (customers.group_case_service, "list_cases"),
        (customers.emotional_release_service, "list_releases"),
        (customers.energy_knot_service, "list_knots"),
        (customers.internal_course_service, "list_courses"),
        (customers.oh_card_reading_service, "list_readings"),
        (customers.offline_course_service, "list_courses"),
        (customers.tea_seat_fee_service, "list_fees"),
        (customers.other_project_service, "list_projects"),
    )
    for service, method in sources:
        monkeypatch.setattr(service, method, lambda: [SimpleNamespace(customer_id="a", amount=0)])
    monkeypatch.setattr(customers.project_deduction_service, "list_deductions", lambda **kwargs: [
        SimpleNamespace(customer_id="a", project_name="粗门次卡"),
        SimpleNamespace(customer_id="a", project_name="30次卡"),
    ])
    assert customers._build_transaction_counts() == {"a": 10}
    items = [{"id": "a", "transaction_count": 10}, {"id": "b", "transaction_count": 2}]
    customers._sort_customer_items(items, "transaction_count", "asc")
    assert [item["id"] for item in items] == ["b", "a"]
