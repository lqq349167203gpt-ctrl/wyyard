from types import SimpleNamespace


def test_daily_counts_include_zero_orders_and_exclude_voided_and_invisible(monkeypatch):
    from app.api import consumption_records as api
    from app.services import offline_course_service, tea_seat_fee_service

    services = [
        (api.membership_card_service, "list_cards"), (api.group_case_service, "list_cases"),
        (api.emotional_release_service, "list_releases"), (api.energy_knot_service, "list_knots"),
        (api.internal_course_service, "list_courses"), (api.oh_card_reading_service, "list_readings"),
        (api.other_project_service, "list_projects"), (offline_course_service, "list_courses"),
        (tea_seat_fee_service, "list_fees"),
    ]
    for service, method in services:
        monkeypatch.setattr(service, method, lambda: [])
    def record(customer="a", **kwargs):
        return SimpleNamespace(customer_id=customer, deal_date="2026-09-10", amount=0, **kwargs)
    monkeypatch.setattr(api.membership_card_service, "list_cards", lambda: [record(), record(voided=True), record(is_deleted=True), record("hidden")])
    monkeypatch.setattr(tea_seat_fee_service, "list_fees", lambda: [record()])
    monkeypatch.setattr(offline_course_service, "list_courses", lambda: [record()])
    monkeypatch.setattr(api.customer_access_service, "require_transaction_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(api.customer_access_service, "visible_customer_ids", lambda *_args: {"a"})
    monkeypatch.setattr(api.customer_service, "list_all_customers", lambda: [])
    assert api.get_daily_payment_counts(None, "2026-09-10") == {"a": 3}
