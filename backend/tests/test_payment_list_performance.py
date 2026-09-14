from app.api import membership_cards


def test_card_list_calculates_remaining_only_for_filtered_page(client, monkeypatch):
    cards = [
        {"id": str(i), "customer_id": "customer", "nickname": "分页会员",
         "created_at": f"2026-09-{i:02d}", "card_type": "次卡"}
        for i in range(1, 6)
    ]
    monkeypatch.setattr(membership_cards.membership_card_service, "list_cards", lambda: cards)
    monkeypatch.setattr(membership_cards.customer_access_service, "filter_record_dicts", lambda _request, rows: rows)
    calls = []

    def remaining(card_id):
        calls.append(card_id)
        return int(card_id)

    monkeypatch.setattr(membership_cards.membership_card_service, "get_card_effective_remaining", remaining)
    response = client.get("/api/membership-cards", params={"page": 2, "page_size": 2, "card_type": "次卡"})
    assert response.status_code == 200
    assert response.json()["total"] == 5
    assert calls == ["3", "2"]
    assert [row["effective_remaining"] for row in response.json()["items"]] == [3, 2]
    calls.clear()
    response = client.get("/api/membership-cards", params={"page": 1, "nickname": "不存在"})
    assert response.json()["items"] == []
    assert calls == []
