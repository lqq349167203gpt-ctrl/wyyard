from types import SimpleNamespace

import pytest

from app.api import customers
from app.utils.pagination import paginate


@pytest.mark.parametrize("field", ["visit_count", "activity_count", "total_payment"])
def test_numeric_customer_sorting_happens_before_pagination(field):
    items = [
        {"id": "zero", field: 0},
        {"id": "three", field: 3},
        {"id": "twelve", field: 12},
    ]

    customers._sort_customer_items(items, field, "desc")

    assert [item["id"] for item in items] == ["twelve", "three", "zero"]
    assert [item["id"] for item in paginate(items, page=1, page_size=2)["items"]] == ["twelve", "three"]
    assert [item["id"] for item in paginate(items, page=2, page_size=2)["items"]] == ["zero"]


def test_member_type_sorting_uses_configured_identity_order(monkeypatch):
    monkeypatch.setattr(
        customers.member_identity_service,
        "list_identities",
        lambda: [
            SimpleNamespace(name="体验会员"),
            SimpleNamespace(name="常规会员"),
            SimpleNamespace(name="核心会员"),
        ],
    )
    items = [
        {"id": "core", "member_type": "核心会员"},
        {"id": "trial", "member_type": "体验会员"},
        {"id": "regular", "member_type": "常规会员"},
    ]

    customers._sort_customer_items(items, "member_type", "asc")

    assert [item["id"] for item in items] == ["trial", "regular", "core"]
