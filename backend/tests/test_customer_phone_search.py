"""两端共用的手机尾号搜索，保持昵称兼容与客户范围约束。"""
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services import customer_access_service, customer_service
from app.utils.customer_record_search import customer_record_matcher
from app.utils.customer_search import masked_customer_phone, matches_customer_search, phone_suffix


@pytest.mark.parametrize("query,expected", [
    ("0017", True), ("17", True), (" 0017 ", True), ("138", False),
    ("5555", False), ("55550017", False), ("Alice", True), ("小林", True),
    ("其他人", False), ("", True), ("0017x", False), ("００１７", False),
])
def test_phone_search_uses_suffix_and_preserves_name_matching(query, expected):
    person = {"nickname": "Alice", "name": "小林", "phone": "+86 138-5555-0017"}
    assert matches_customer_search(person, query) is expected
    assert matches_customer_search(SimpleNamespace(**person), query) is expected
    assert phone_suffix(person) == "0017"


@pytest.fixture
def phone_people(client, monkeypatch):
    from app.services import organization_service

    monkeypatch.setattr(customer_service, "_customers", {})
    if not any(org.name == "无忧茶院" for org in organization_service.list_organizations()):
        assert client.post("/api/organizations", json={"name": "无忧茶院", "member_ids": []}).status_code == 200
    people = []
    for label, phone in (("甲", "13855550017"), ("乙", "13711110017"), ("中段", "13800179999")):
        response = client.post("/api/customers", json={
            "nickname": f"尾号测试{label}_{uuid4().hex[:8]}", "name": f"真实姓名{label}",
            "wechat": uuid4().hex, "phone": phone,
        })
        assert response.status_code == 200, response.text
        people.append(customer_service.get_customer(response.json()["id"]))
    monkeypatch.setattr(customer_service, "_customers", {c.id: c for c in people})
    return people


@pytest.mark.parametrize("resource", [
    "visits", "class-records", "membership-cards", "group-cases", "emotional-releases",
    "energy-knots", "oh-card-readings", "internal-courses", "tea-seat-fees", "offline-courses",
    "other-projects", "online-tea", "companion-camps", "healing-records",
    "group-case-sessions", "emotional-release-sessions", "energy-knot-sessions", "internal-course-sessions",
])
def test_customer_search_endpoints_accept_phone_suffix(client, phone_people, resource):
    response = client.get(f"/api/{resource}/search-customers", params={"q": "17"})
    assert response.status_code == 200, response.text
    rows = response.json()
    assert {row["id"] for row in rows} == {c.id for c in phone_people[:2]}
    assert all("phone" not in row for row in rows)
    assert {row["phone_masked"] for row in rows} == {"138****0017", "137****0017"}
    assert all(c.phone not in response.text for c in phone_people)


def test_list_paging_and_light_directory_keep_suffix_without_raw_phone(client, phone_people):
    first = client.get("/api/customers", params={"nickname": "0017", "page": 1, "page_size": 1}).json()
    second = client.get("/api/customers", params={"nickname": "0017", "page": 2, "page_size": 1}).json()
    assert first["total"] == second["total"] == 2
    assert {first["items"][0]["id"], second["items"][0]["id"]} == {c.id for c in phone_people[:2]}
    response = client.get("/api/customers/light", params={"purpose": "selector"})
    assert response.status_code == 200, response.text
    options = {row["id"]: row for row in response.json()}
    assert options[phone_people[0].id]["phone_suffix"] == "0017"
    assert options[phone_people[0].id]["phone_masked"] == "138****0017"
    assert all("phone" not in row for row in options.values())
    batch = client.post("/api/customers/batch", json={"ids": [phone_people[0].id]}).json()
    assert batch[0]["phone_suffix"] == "0017" and "phone" not in batch[0]
    assert batch[0]["phone_masked"] == "138****0017"


def test_phone_suffix_never_expands_customer_scope(client, phone_people, monkeypatch):
    allowed_id = phone_people[0].id
    monkeypatch.setattr(customer_access_service, "filter_customers", lambda request, people: [c for c in people if c.id == allowed_id])
    for resource in ("visits", "membership-cards", "online-tea", "companion-camps"):
        response = client.get(f"/api/{resource}/search-customers", params={"q": "17"})
        assert response.status_code == 200, response.text
        assert {row["id"] for row in response.json()} == {allowed_id}
    directory = client.get("/api/customers/light", params={"purpose": "selector"}).json()
    assert {row["id"] for row in directory} == {allowed_id}
    for path in ("/api/visit-notes/follow-up-people", "/api/customer-follow-ups/follow-up-people"):
        staff = client.get(path).json()
        assert next(row for row in staff if row["id"] == phone_people[0].id)["phone_suffix"] == "0017"
        assert next(row for row in staff if row["id"] == phone_people[1].id)["phone_suffix"] == ""
        assert next(row for row in staff if row["id"] == phone_people[1].id)["phone_masked"] == ""
        assert next(row for row in staff if row["id"] == phone_people[0].id)["phone_masked"] == "138****0017"


def test_historical_payment_and_communication_filters_use_customer_id(client, phone_people, monkeypatch):
    from app.models.membership_card import MembershipCard
    from app.services import membership_card_service

    now = datetime.now(timezone.utc)
    customer = phone_people[0]
    card = MembershipCard(id="phone-search-card", customer_id=customer.id, nickname="旧昵称",
        card_type="次卡", price=0, total_count=1, remaining_count=1, effective_date="2026-01-01",
        created_at=now, updated_at=now)
    monkeypatch.setattr(membership_card_service, "_cards", {card.id: card})
    matches = customer_record_matcher("0017")
    assert matches({"customer_id": customer.id, "nickname": "旧昵称"})
    assert not matches({"customer_id": phone_people[2].id, "nickname": "旧昵称"})
    response = client.get("/api/membership-cards", params={"nickname": "0017", "page": 1}).json()
    assert [row["id"] for row in response["items"]] == [card.id]
    combined = client.get("/api/payment-exports/records", params={"nickname": "0017"}).json()
    assert any(row["record"]["id"] == card.id for row in combined["items"])
    created = client.post("/api/communication-records", json={
        "customer_id": customer.id, "customer_nickname": customer.nickname, "content": "电话尾号回归",
    })
    assert created.status_code == 200, created.text
    records = client.get("/api/communication-records", params={"nickname": "0017", "page": 1}).json()
    assert any(row["id"] == created.json()["id"] for row in records["items"])
    assert client.get("/api/communication-records", params={"nickname": "5555", "page": 1}).json()["total"] == 0


@pytest.mark.parametrize("phone,expected", [
    ("13855550017", "138****0017"), ("+86 138-5555-0017", "138****0017"),
    ("138****0017", "138****0017"), ("", ""), ("1234", "1**4"), ("12", "**"),
])
def test_search_phone_display_is_always_masked(phone, expected):
    assert masked_customer_phone({"phone": phone}) == expected
