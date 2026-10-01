"""公共读取只统一来源，不改产品范围或页面统计策略。"""

from importlib import import_module

import pytest

from app.api import statistics
from app.services import payment_sources


@pytest.mark.parametrize("key,module,method", [
    ("membership-cards", "membership_card_service", "list_cards"),
    ("group-cases", "group_case_service", "list_cases"),
    ("emotional-releases", "emotional_release_service", "list_releases"),
    ("energy-knots", "energy_knot_service", "list_knots"),
    ("internal-courses", "internal_course_service", "list_courses"),
    ("oh-card-readings", "oh_card_reading_service", "list_readings"),
    ("offline-courses", "offline_course_service", "list_courses"),
    ("tea-seat-fees", "tea_seat_fee_service", "list_fees"),
    ("other-projects", "other_project_service", "list_projects"),
])
def test_sources_read_current_records_without_filtering_or_caching(monkeypatch, key, module, method):
    service = import_module(f"app.services.{module}")
    loader = payment_sources.payment_loader(key)
    records = [{"id": "a", "voided": True}, {"id": "b", "deal_date": ""}]
    monkeypatch.setattr(service, method, lambda: records)
    assert loader() is records
    newer = [{"id": "c"}]
    monkeypatch.setattr(service, method, lambda: newer)
    assert loader() is newer


def test_statistics_preserves_existing_product_scope(monkeypatch):
    monkeypatch.setattr(payment_sources, "list_payment_records", lambda key: [key])
    assert statistics._payment_record_groups() == [[key] for key in (
        "membership-cards", "group-cases", "emotional-releases", "energy-knots",
        "internal-courses", "offline-courses", "oh-card-readings", "other-projects",
    )]
    assert len(list(payment_sources.payment_record_groups())) == 9


def test_unknown_product_is_not_silently_skipped():
    with pytest.raises(ValueError, match="不支持的付费项目"):
        payment_sources.payment_loader("unknown")
