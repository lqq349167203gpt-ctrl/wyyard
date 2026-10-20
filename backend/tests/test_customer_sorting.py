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


@pytest.mark.parametrize("order,expected", [
    ("asc", ["low", "full", "old", "empty", "missing"]),
    ("desc", ["old", "full", "low", "empty", "missing"]),
])
def test_card_status_sorting_uses_its_own_config_order_and_keeps_blanks_last(monkeypatch, order, expected):
    def configured(group="identity"):
        assert group == "card_status"
        return [SimpleNamespace(name="即将用完"), SimpleNamespace(name="卡次充足")]

    monkeypatch.setattr(customers.member_identity_service, "list_identities", configured)
    items = [
        {"id": "empty", "card_status": ""}, {"id": "old", "card_status": "历史状态"},
        {"id": "full", "card_status": "卡次充足"}, {"id": "missing", "card_status": None},
        {"id": "low", "card_status": "即将用完"},
    ]
    customers._sort_customer_items(items, "card_status", order)
    assert [item["id"] for item in items] == expected


@pytest.mark.parametrize("order,expected", [("asc", ["low", "full", "empty"]), ("desc", ["full", "low", "empty"])])
def test_card_status_api_sorts_all_customers_before_pagination(client, monkeypatch, order, expected):
    records = [SimpleNamespace(id=cid, nickname=cid, card_status=status)
               for cid, status in [("empty", ""), ("full", "卡次充足"), ("low", "即将用完")]]
    monkeypatch.setattr(customers.customer_service, "list_customers", lambda: records)
    monkeypatch.setattr(customers.member_identity_service, "list_identities", lambda group: [
        SimpleNamespace(name="即将用完"), SimpleNamespace(name="卡次充足"),
    ] if group == "card_status" else [])
    monkeypatch.setattr(customers, "_build_enriched_items", lambda records, **kwargs: [
        customers._customer_list_base(customer) for customer in records
    ])
    actual = []
    for page in (1, 2):
        response = client.get("/api/customers", params={
            "sort_by": "card_status", "sort_order": order, "page": page, "page_size": 2, "list_view": True,
        })
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 3
        actual.extend(item["id"] for item in response.json()["items"])
    assert actual == expected
