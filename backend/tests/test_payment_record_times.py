def test_transaction_quantity_shows_card_times(client, created_customer):
    """交易记录的数量跟卡次数走，不能把每一笔都记成 1。"""
    customer = created_customer
    counted = client.post("/api/membership-cards", json={
        "customer_id": customer["id"],
        "nickname": customer["nickname"],
        "card_type": "体验会员",
        "price": 398,
        "effective_date": "2026-06-04",
        "duration_type": "month",
        "duration_value": 12,
        "total_count": 4,
        "remaining_count": 4,
    })
    unlimited = client.post("/api/membership-cards", json={
        "customer_id": customer["id"],
        "nickname": customer["nickname"],
        "card_type": "定制化",
        "price": 0,
        "effective_date": "2026-06-15",
        "agreement_status": "unsigned",
        "total_count": None,
        "remaining_count": None,
    })
    course = client.post("/api/internal-courses", json={
        "customer_id": customer["id"],
        "nickname": customer["nickname"],
        "course_type": "疗愈师课程：自爱力构建",
        "price": 20000,
        "effective_date": "2026-07-09",
    })
    game = client.post("/api/group-cases", json={
        "customer_id": customer["id"],
        "nickname": customer["nickname"],
        "purchase_count": 5,
        "amount": 999,
    })
    assert counted.status_code == 200, counted.text
    assert unlimited.status_code == 200, unlimited.text
    assert course.status_code == 200, course.text
    assert game.status_code == 200, game.text

    records = client.get(f"/api/customer-detail/{customer['id']}").json()["payment_records"]
    by_id = {item["source_id"]: item["quantity"] for item in records}
    assert by_id[counted.json()["id"]] == "4次"
    assert by_id[unlimited.json()["id"]] == "无限"
    assert by_id[course.json()["id"]] == "无限"
    assert by_id[game.json()["id"]] == "5次"
