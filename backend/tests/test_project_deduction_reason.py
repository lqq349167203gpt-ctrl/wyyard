"""销卡原因与活动扣卡触发条件测试。"""

import json


def _create_count_card(client, customer, count=5):
    response = client.post("/api/membership-cards", json={
        "customer_id": customer["id"],
        "nickname": customer["nickname"],
        "card_type": "测试次卡",
        "price": 500,
        "effective_date": "2026-01-01",
        "total_count": count,
        "remaining_count": count,
    })
    assert response.status_code == 200
    return response.json()


def test_customer_detail_keeps_each_active_card_remaining_separate(client, created_customer):
    cards = []
    for card_type, count, effective_date in (
        ("体验会员", 4, "2026-01-01"),
        ("45次卡", 45, "2026-02-01"),
    ):
        response = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": card_type,
            "price": 398 if count == 4 else 5999,
            "effective_date": effective_date,
            "duration_type": "month",
            "duration_value": 120,
            "total_count": count,
            "remaining_count": count,
        })
        assert response.status_code == 200
        cards.append(response.json())

    response = client.get(f"/api/customer-detail/{created_customer['id']}")
    assert response.status_code == 200
    membership_items = [
        item for item in response.json()["purchase_summary"]
        if item["type"] == "会员卡" and not item["voided"]
    ]
    experience = next(item for item in membership_items if item["name"] == "体验会员")
    forty_five = next(item for item in membership_items if item["name"] == "45次卡")

    assert experience["remaining"] == 4
    assert experience["total_purchased"] == 4
    assert forty_five["remaining"] == 45
    assert forty_five["total_purchased"] == 45

    for card in cards:
        client.delete(f"/api/membership-cards/{card['id']}")


def test_manual_deduction_requires_reason(client, created_customer):
    card = _create_count_card(client, created_customer)
    payload = {
        "customer_id": created_customer["id"],
        "project_type": "membership-cards",
        "project_id": card["id"],
        "count": 1,
    }

    missing = client.post("/api/project-deductions", json=payload)
    assert missing.status_code == 422

    blank = client.post("/api/project-deductions", json={**payload, "reason": "   "})
    assert blank.status_code == 400

    created = client.post(
        "/api/project-deductions",
        json={**payload, "reason": "客户临时使用一次"},
    )
    assert created.status_code == 200
    assert created.json()["reason"] == "客户临时使用一次"

    client.delete(f"/api/project-deductions/{created.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_manual_deduction_appears_in_client_records(client, created_customer):
    from app.middleware.jwt_auth import create_customer_token

    card = _create_count_card(client, created_customer)
    created = client.post("/api/project-deductions", json={
        "customer_id": created_customer["id"],
        "project_type": "membership-cards",
        "project_id": card["id"],
        "count": 1,
        "reason": "前台临时手工销卡",
        "created_by": "测试管理员",
    })
    assert created.status_code == 200

    token = create_customer_token(created_customer["id"], created_customer["nickname"])
    response = client.get(
        "/api/client/deductions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    membership_summary = next(
        item for item in response.json()["purchase_summary"]
        if item["type"] == "会员卡"
    )
    assert membership_summary["current_remaining"] == 4
    assert membership_summary["current_total"] == 5
    assert membership_summary["debt_count"] == 0
    manual = next(
        item
        for item in response.json()["items"]
        if item["source"] == "manual" and item["project_name"] == card["card_type"]
    )
    assert manual["reason"] == "前台临时手工销卡"
    assert manual["created_by"] == "测试管理员"
    project = next(
        item
        for item in response.json()["projects"]
        if item["type"] == "会员卡" and item["name"] == card["card_type"]
    )
    assert project["remaining"] == 4
    assert project["total"] == 5
    assert project["effective_date"] == "2026-01-01"
    assert project["expiry_date"] == ""

    client.delete(f"/api/project-deductions/{created.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_expired_card_keeps_remaining_for_client_display(client, created_customer):
    from app.middleware.jwt_auth import create_customer_token

    response = client.post("/api/membership-cards", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "card_type": "测试过期次卡",
        "price": 500,
        "effective_date": "1999-01-01",
        "duration_type": "day",
        "duration_value": 1,
        "total_count": 5,
        "remaining_count": 5,
    })
    assert response.status_code == 200
    card = response.json()

    token = create_customer_token(created_customer["id"], created_customer["nickname"])
    client_response = client.get(
        "/api/client/deductions",
        headers={"Authorization": f"Bearer {token}"},
    )
    project = next(
        item
        for item in client_response.json()["projects"]
        if item["name"] == card["card_type"]
    )
    assert project["status"] == "expired"
    assert project["remaining"] == 5
    assert project["total"] == 5
    current_response = client.get(
        "/api/client/remaining",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert current_response.status_code == 200
    assert current_response.json()["remaining"] == 0
    membership_summary = next(
        item for item in client_response.json()["purchase_summary"]
        if item["type"] == "会员卡"
    )
    assert membership_summary["current_remaining"] == 0
    assert membership_summary["current_total"] == 0

    client.delete(f"/api/membership-cards/{card['id']}")


def test_activity_deducts_only_after_arrival(client, created_customer):
    card = _create_count_card(client, created_customer)
    activity_date = "2026-07-24"
    activity = client.post("/api/class-records", json={
        "date": activity_date,
        "course_id": "test-course",
        "course_name": "到场扣卡测试",
        "participant_ids": [created_customer["id"]],
        "is_public_welfare": False,
    })
    assert activity.status_code == 200

    before_arrival = client.get(f"/api/membership-cards/{card['id']}")
    assert before_arrival.status_code == 200
    assert before_arrival.json()["effective_remaining"] == 5
    before_detail = client.get(f"/api/customer-detail/{created_customer['id']}").json()
    before_activity = next(
        row for row in before_detail["activities"]
        if row["session_id"] == activity.json()["id"]
    )
    assert before_activity["deduction_summary"] == "未参与"

    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    after_arrival = client.get(f"/api/membership-cards/{card['id']}")
    assert after_arrival.status_code == 200
    assert after_arrival.json()["effective_remaining"] == 4
    after_detail = client.get(f"/api/customer-detail/{created_customer['id']}").json()
    after_activity = next(
        row for row in after_detail["activities"]
        if row["session_id"] == activity.json()["id"]
    )
    assert after_activity["deduction_summary"] == "会员卡扣卡1次"

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_project_owner_must_be_invited_and_deducts_only_after_arrival(client, created_customer):
    customer_id = created_customer["id"]
    nickname = created_customer["nickname"]
    activity_date = "2026-08-08"

    draft = client.post("/api/group-case-sessions", json={
        "date": activity_date,
        "owner_id": "",
        "owner_name": "",
    })
    assert draft.status_code == 200
    client.delete(f"/api/group-case-sessions/{draft.json()['id']}")

    rejected = client.post("/api/group-case-sessions", json={
        "date": activity_date,
        "owner_id": customer_id,
        "owner_name": nickname,
    })
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "案主只能选择当天邀约名单中的客户"

    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": customer_id,
        "arrived": False,
    })
    assert visit.status_code == 200

    group_session = client.post("/api/group-case-sessions", json={
        "date": activity_date,
        "owner_id": customer_id,
        "owner_name": nickname,
    })
    emotional_session = client.post("/api/emotional-release-sessions", json={
        "date": activity_date,
        "owner_id": customer_id,
        "owner_name": nickname,
    })
    energy_session = client.post("/api/energy-knot-sessions", json={
        "date": activity_date,
        "owner_id": customer_id,
        "owner_name": nickname,
        "description": json.dumps([{"id": customer_id, "name": nickname, "count": 2}], ensure_ascii=False),
    })
    assert group_session.status_code == 200
    assert emotional_session.status_code == 200
    assert energy_session.status_code == 200

    from app.services import (
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
    )

    assert group_case_session_service.get_remaining_count(customer_id) == 0
    assert emotional_release_session_service.get_remaining_count(customer_id) == 0
    assert energy_knot_session_service.get_remaining_count(customer_id) == 0

    before_detail = client.get(f"/api/customer-detail/{customer_id}").json()
    project_rows = [
        row for row in before_detail["activities"]
        if row["type"] in {"觉醒游戏", "情绪释放", "能量结"}
        and row["date"] == activity_date
    ]
    assert {row["deduction_summary"] for row in project_rows} == {"未参与"}

    arrived = client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": True})
    assert arrived.status_code == 200
    assert group_case_session_service.get_remaining_count(customer_id) == -1
    assert emotional_release_session_service.get_remaining_count(customer_id) == -1
    assert energy_knot_session_service.get_remaining_count(customer_id) == -2

    after_detail = client.get(f"/api/customer-detail/{customer_id}").json()
    purchase_summaries = {
        row["type"]: row
        for row in after_detail["purchase_summary"]
        if row["type"] in {"觉醒游戏", "情绪释放", "能量结"}
    }
    search_configs = [
        ("group-case-sessions", "觉醒游戏", -1),
        ("emotional-release-sessions", "情绪释放", -1),
        ("energy-knot-sessions", "能量结", -2),
    ]
    for endpoint, type_label, expected in search_configs:
        search_result = client.get(
            f"/api/{endpoint}/search-customers",
            params={"q": nickname, "date": activity_date},
        )
        assert search_result.status_code == 200
        owner = next(item for item in search_result.json() if item["id"] == customer_id)
        assert owner["remaining"] == expected
        summary = purchase_summaries[type_label]
        assert summary["effective_remaining"] == expected
        assert summary["current_remaining"] == expected
        assert summary["current_total"] == 0
        assert summary["debt_count"] == -expected
        assert sum(item["count"] for item in summary["debt_activities"]) == -expected
        assert all(item["date"] == activity_date for item in summary["debt_activities"])

    summaries = {
        row["type"]: row["deduction_summary"]
        for row in after_detail["activities"]
        if row["type"] in {"觉醒游戏", "情绪释放", "能量结"}
        and row["date"] == activity_date
    }
    assert summaries == {
        "觉醒游戏": "觉醒游戏扣卡1次",
        "情绪释放": "情绪释放扣卡1次",
        "能量结": "能量结部位2个",
    }

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    assert group_case_session_service.get_remaining_count(customer_id) == 0
    assert emotional_release_session_service.get_remaining_count(customer_id) == 0
    assert energy_knot_session_service.get_remaining_count(customer_id) == 0

    client.delete(f"/api/group-case-sessions/{group_session.json()['id']}")
    client.delete(f"/api/emotional-release-sessions/{emotional_session.json()['id']}")
    client.delete(f"/api/energy-knot-sessions/{energy_session.json()['id']}")


def test_project_owner_remaining_ignores_expired_and_future_purchases(client, created_customer):
    customer_id = created_customer["id"]
    nickname = created_customer["nickname"]
    configs = [
        ("group-cases", "group-case-sessions", "觉醒游戏"),
        ("emotional-releases", "emotional-release-sessions", "情绪释放"),
        ("energy-knots", "energy-knot-sessions", "能量结"),
    ]
    purchase_ids = []

    for purchase_endpoint, search_endpoint, _ in configs:
        active = client.post(f"/api/{purchase_endpoint}", json={
            "customer_id": customer_id,
            "nickname": nickname,
            "purchase_count": 2,
            "effective_date": "2000-01-01",
        })
        expired = client.post(f"/api/{purchase_endpoint}", json={
            "customer_id": customer_id,
            "nickname": nickname,
            "purchase_count": 5,
            "effective_date": "2000-01-01",
            "expiry_date": "2000-01-02",
        })
        future = client.post(f"/api/{purchase_endpoint}", json={
            "customer_id": customer_id,
            "nickname": nickname,
            "purchase_count": 7,
            "effective_date": "2999-01-01",
        })
        assert active.status_code == 200
        assert expired.status_code == 200
        assert future.status_code == 200
        purchase_ids.extend([
            (purchase_endpoint, active.json()["id"]),
            (purchase_endpoint, expired.json()["id"]),
            (purchase_endpoint, future.json()["id"]),
        ])

        search_result = client.get(
            f"/api/{search_endpoint}/search-customers",
            params={"q": nickname},
        )
        owner = next(item for item in search_result.json() if item["id"] == customer_id)
        assert owner["remaining"] == 2

    detail = client.get(f"/api/customer-detail/{customer_id}")
    assert detail.status_code == 200
    summaries = {row["type"]: row for row in detail.json()["purchase_summary"]}
    for _, _, type_label in configs:
        assert summaries[type_label]["effective_remaining"] == 2
        assert summaries[type_label]["current_remaining"] == 2
        assert summaries[type_label]["current_total"] == 2
        assert summaries[type_label]["debt_count"] == 0
        assert summaries[type_label]["debt_activities"] == []

    for purchase_endpoint, purchase_id in purchase_ids:
        deleted = client.delete(f"/api/{purchase_endpoint}/{purchase_id}")
        assert deleted.status_code == 200


def test_activity_supports_configurable_membership_deduction_count(client, created_customer):
    from app.services import membership_card_service

    card = _create_count_card(client, created_customer)
    activity_date = "2026-07-24"
    activity = client.post("/api/class-records", json={
        "date": activity_date,
        "course_id": "test-multi-deduction-course",
        "course_name": "多次扣卡测试",
        "participant_ids": [created_customer["id"]],
        "membership_deduction_count": 2,
    })
    assert activity.status_code == 200
    assert activity.json()["membership_deduction_count"] == 2

    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    card_state = client.get(f"/api/membership-cards/{card['id']}")
    assert card_state.json()["effective_remaining"] == 3
    base_key = f"class:{activity.json()['id']}"
    usage_keys = {
        item["key"]
        for item in membership_card_service.list_activity_usage_records(created_customer["id"])
        if item["key"].startswith(base_key)
    }
    assert usage_keys == {base_key, f"{base_key}#unit=2"}

    reduced = client.patch(
        f"/api/class-records/{activity.json()['id']}",
        json={"membership_deduction_count": 1},
    )
    assert reduced.status_code == 200
    assert client.get(f"/api/membership-cards/{card['id']}").json()["effective_remaining"] == 4

    welfare = client.patch(
        f"/api/class-records/{activity.json()['id']}",
        json={"is_public_welfare": True, "membership_deduction_count": 0},
    )
    assert welfare.status_code == 200
    assert welfare.json()["membership_deduction_count"] == 0
    assert client.get(f"/api/membership-cards/{card['id']}").json()["effective_remaining"] == 5

    chargeable_again = client.patch(
        f"/api/class-records/{activity.json()['id']}",
        json={"is_public_welfare": False},
    )
    assert chargeable_again.status_code == 200
    assert chargeable_again.json()["membership_deduction_count"] == 1
    assert client.get(f"/api/membership-cards/{card['id']}").json()["effective_remaining"] == 4

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_course_withdrawal_keeps_participant_history_and_restores_card_usage(client, created_customer):
    from app.middleware.jwt_auth import create_customer_token
    from app.services import membership_card_service

    card = _create_count_card(client, created_customer)
    activity_date = "2099-07-25"
    activity = client.post("/api/class-records", json={
        "date": activity_date,
        "course_id": "withdrawal-course",
        "course_name": "退课测试课程",
        "participant_ids": [created_customer["id"]],
        "membership_deduction_count": 2,
        "is_published": True,
    })
    assert activity.status_code == 200
    activity_id = activity.json()["id"]
    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200
    assert client.get(f"/api/membership-cards/{card['id']}").json()["effective_remaining"] == 3

    token = create_customer_token(created_customer["id"], created_customer["nickname"])
    customer_headers = {"Authorization": f"Bearer {token}"}
    signup = client.post(
        f"/api/client/activities/{activity_id}/signup",
        headers=customer_headers,
    )
    assert signup.status_code == 200

    withdrawn = client.post(
        f"/api/class-records/{activity_id}/withdrawals",
        json={"customer_id": created_customer["id"]},
    )
    assert withdrawn.status_code == 200
    assert created_customer["id"] in withdrawn.json()["participant_ids"]
    assert withdrawn.json()["withdrawn_participant_ids"] == [created_customer["id"]]
    assert client.get(f"/api/membership-cards/{card['id']}").json()["effective_remaining"] == 5
    assert not any(
        item["key"].startswith(f"class:{activity_id}")
        for item in membership_card_service.list_activity_usage_records(created_customer["id"])
    )

    detail = client.get(f"/api/customer-detail/{created_customer['id']}")
    activity_row = next(
        item for item in detail.json()["activities"]
        if item["activity_key"] == f"class:{activity_id}"
    )
    assert activity_row["withdrawn"] is True
    assert activity_row["participated"] is False
    assert activity_row["membership_deduction_count"] == 0
    assert activity_row["deduction_summary"] == "已退课"

    client_activity = client.get(
        f"/api/client/activities/{activity_id}",
        headers=customer_headers,
    )
    assert client_activity.status_code == 200
    assert client_activity.json()["withdrawn"] is True
    assert client_activity.json()["signed_up"] is False
    assert not any(item["is_me"] for item in client_activity.json()["participants"])
    signup_again = client.post(
        f"/api/client/activities/{activity_id}/signup",
        headers=customer_headers,
    )
    assert signup_again.status_code == 409
    assert "已办理退课" in signup_again.json()["detail"]

    removal = client.patch(
        f"/api/class-records/{activity_id}/participants",
        json={"participant_ids": []},
    )
    assert removal.status_code == 400
    assert "已退课人员" in removal.json()["detail"]

    direct_removal = client.patch(
        f"/api/class-records/{activity_id}",
        json={"participant_ids": [], "groups": []},
    )
    assert direct_removal.status_code == 400

    status_override = client.patch(
        f"/api/class-records/{activity_id}",
        json={"withdrawn_participant_ids": []},
    )
    assert status_override.status_code == 200
    assert status_override.json()["withdrawn_participant_ids"] == [created_customer["id"]]

    changed_count = client.patch(
        f"/api/class-records/{activity_id}",
        json={"membership_deduction_count": 3},
    )
    assert changed_count.status_code == 200
    assert client.get(f"/api/membership-cards/{card['id']}").json()["effective_remaining"] == 5

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity_id}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_activity_without_membership_card_keeps_negative_remaining(client, created_customer):
    from app.middleware.jwt_auth import create_customer_token
    from app.services import membership_card_service

    activity_date = "2026-07-24"
    activity = client.post("/api/class-records", json={
        "date": activity_date,
        "course_id": "test-no-card-multi-deduction",
        "course_name": "无卡多次扣卡测试",
        "participant_ids": [created_customer["id"]],
        "membership_deduction_count": 2,
    })
    assert activity.status_code == 200

    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200
    assert membership_card_service.get_debt(created_customer["id"]) == 2

    detail = client.get(f"/api/customer-detail/{created_customer['id']}")
    assert detail.status_code == 200
    membership_summary = next(
        item for item in detail.json()["purchase_summary"]
        if item["type"] == "会员卡"
    )
    assert membership_summary["effective_remaining"] == -2
    assert membership_summary["advance_deductions"] == 2
    # 当前剩余只表示有效期内会员卡的可用卡次；历史欠卡单独展示，不混入当前余量。
    assert membership_summary["current_remaining"] == 0
    assert membership_summary["current_total"] == 0
    assert membership_summary["debt_count"] == 2
    assert membership_summary["debt_activities"] == [{
        "label": "无卡多次扣卡测试",
        "date": activity_date,
        "count": 2,
    }]

    token = create_customer_token(created_customer["id"], created_customer["nickname"])
    deduction_response = client.get(
        "/api/client/deductions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert deduction_response.status_code == 200
    debt_records = [
        item
        for item in deduction_response.json()["items"]
        if item["project_name"] == "无卡多次扣卡测试"
    ]
    assert len(debt_records) == 2
    assert sum(item["count"] for item in debt_records) == 2
    assert {item["benefit_name"] for item in debt_records} == {"预支扣卡"}
    assert {item["benefit_type"] for item in debt_records} == {"membership_debt"}
    assert sorted(item["remaining_after"] for item in debt_records) == [-2, -1]

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    assert membership_card_service.get_effective_remaining(created_customer["id"]) == 0
    client.delete(f"/api/class-records/{activity.json()['id']}")


def test_historical_debt_does_not_reduce_current_active_card_remaining(client, created_customer):
    from app.middleware.jwt_auth import create_customer_token

    activity_date = "2026-07-24"
    activity = client.post("/api/class-records", json={
        "date": activity_date,
        "course_id": "test-historical-debt-current-balance",
        "course_name": "历史欠卡与当前余量分离测试",
        "participant_ids": [created_customer["id"]],
        "membership_deduction_count": 2,
    })
    assert activity.status_code == 200
    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    # 后买的卡不覆盖 7 月历史活动，因此历史欠卡仍保留；但当前有效卡 5 次必须完整计入当前剩余。
    card = client.post("/api/membership-cards", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "card_type": "后购测试卡",
        "price": 500,
        "effective_date": "2026-08-01",
        "duration_type": "month",
        "duration_value": 120,
        "total_count": 5,
        "remaining_count": 5,
    })
    assert card.status_code == 200

    detail = client.get(f"/api/customer-detail/{created_customer['id']}")
    assert detail.status_code == 200
    membership_summary = next(
        item for item in detail.json()["purchase_summary"]
        if item["type"] == "会员卡"
    )
    assert membership_summary["current_remaining"] == 5
    assert membership_summary["current_total"] == 5
    assert membership_summary["debt_count"] == 2

    token = create_customer_token(created_customer["id"], created_customer["nickname"])
    current_response = client.get(
        "/api/client/remaining",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert current_response.status_code == 200
    assert current_response.json() == {
        "remaining": 5,
        "current_total": 5,
        "debt_count": 2,
    }

    client.delete(f"/api/membership-cards/{card.json()['id']}")
    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")


def test_reconcile_removes_duplicate_and_public_welfare_debt(
    client,
    created_customer,
):
    from app.services import class_record_service, membership_card_service

    activity_date = "2026-07-24"
    activity = client.post("/api/class-records", json={
        "date": activity_date,
        "course_id": "test-reconcile-debt",
        "course_name": "预支流水校准测试",
        "participant_ids": [created_customer["id"]],
    })
    assert activity.status_code == 200
    activity_key = f"class:{activity.json()['id']}"

    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200
    assert membership_card_service.get_debt(created_customer["id"]) == 1

    membership_card_service._debt_activities[created_customer["id"]].extend([
        activity_key,
        activity_key,
    ])
    membership_card_service._debts[created_customer["id"]] = 3
    assert membership_card_service.get_effective_remaining(created_customer["id"]) == -1
    assert membership_card_service._debt_activities[created_customer["id"]] == [
        activity_key,
    ]

    record = class_record_service.get_record(activity.json()["id"])
    record.is_public_welfare = True
    record.membership_deduction_count = 0
    class_record_service._save(record.id)

    assert membership_card_service.get_effective_remaining(created_customer["id"]) == 0
    assert membership_card_service.get_debt(created_customer["id"]) == 0

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")


def test_debt_deduction_is_idempotent(client, created_customer):
    from app.services import membership_card_service

    activity_date = "2026-07-24"
    activity = client.post("/api/class-records", json={
        "date": activity_date,
        "course_id": "test-idempotent-debt",
        "course_name": "预支幂等测试",
        "participant_ids": [created_customer["id"]],
    })
    assert activity.status_code == 200
    activity_key = f"class:{activity.json()['id']}"

    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    assert membership_card_service.deduct_for_activity(
        created_customer["id"],
        activity_key,
    ) is True
    assert membership_card_service.deduct_for_activity(
        created_customer["id"],
        activity_key,
    ) is True
    assert membership_card_service.get_debt(created_customer["id"]) == 1

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")


def test_activity_remaining_is_snapshot_after_that_deduction(client, created_customer):
    from app.middleware.jwt_auth import create_customer_token

    card = _create_count_card(client, created_customer, count=3)
    activity = client.post("/api/class-records", json={
        "date": "2026-07-24",
        "course_id": "test-snapshot-course",
        "course_name": "剩余次数快照测试",
        "participant_ids": [created_customer["id"]],
        "is_public_welfare": False,
    })
    assert activity.status_code == 200
    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-24",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    manual = client.post("/api/project-deductions", json={
        "customer_id": created_customer["id"],
        "project_type": "membership-cards",
        "project_id": card["id"],
        "count": 1,
        "reason": "快照稳定性测试",
    })
    assert manual.status_code == 200
    assert manual.json()["remaining_after"] == 1

    token = create_customer_token(created_customer["id"], created_customer["nickname"])
    response = client.get(
        "/api/client/deductions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    activity_record = next(
        item
        for item in response.json()["items"]
        if item["source"] == "activity" and item["project_name"] == "剩余次数快照测试"
    )
    assert activity_record["remaining_after"] == 2
    assert activity_record["activity_role"] == "参与者"

    client.delete(f"/api/project-deductions/{manual.json()['id']}")
    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_unlimited_card_usage_keeps_card_name(client, created_customer):
    from app.services import membership_card_service

    card_response = client.post("/api/membership-cards", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "card_type": "测试不限次卡",
        "price": 1000,
        "effective_date": "2026-01-01",
        "total_count": None,
        "remaining_count": None,
    })
    assert card_response.status_code == 200
    card = card_response.json()

    activity = client.post("/api/class-records", json={
        "date": "2026-07-25",
        "course_id": "test-unlimited-course",
        "course_name": "不限次权益测试",
        "participant_ids": [created_customer["id"]],
    })
    assert activity.status_code == 200

    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-25",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    usage = membership_card_service.list_activity_usage_records(created_customer["id"])
    record = next(item for item in usage if item["key"] == f"class:{activity.json()['id']}")
    assert record["benefit_type"] == "unlimited_card"
    assert record["benefit_name"] == "测试不限次卡"
    assert record["card_id"] == card["id"]

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_membership_card_has_priority_over_internal_course(client, created_customer):
    from app.services import membership_card_service

    course_response = client.post("/api/internal-courses", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "course_type": "疗愈师课程：自爱力构建",
        "price": 3000,
        "effective_date": "2026-01-01",
    })
    assert course_response.status_code == 200
    course = course_response.json()

    card = _create_count_card(client, created_customer)
    activity = client.post("/api/class-records", json={
        "date": "2026-07-26",
        "course_id": "test-internal-benefit",
        "course_name": "内部课程权益测试",
        "participant_ids": [created_customer["id"]],
    })
    assert activity.status_code == 200

    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-26",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    usage = membership_card_service.list_activity_usage_records(created_customer["id"])
    record = next(item for item in usage if item["key"] == f"class:{activity.json()['id']}")
    assert record["benefit_type"] == "count_card"
    assert record["benefit_name"] == card["card_type"]
    assert record["benefit_id"] == card["id"]
    assert record["remaining_after"] == 4

    card_state = client.get(f"/api/membership-cards/{card['id']}")
    assert card_state.json()["effective_remaining"] == 4

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")
    client.delete(f"/api/internal-courses/{course['id']}")


def test_internal_course_covers_activity_after_card_is_exhausted(client, created_customer):
    from app.services import membership_card_service

    course_response = client.post("/api/internal-courses", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "course_type": "疗愈师课程：自爱力构建",
        "price": 3000,
        "effective_date": "2026-01-01",
    })
    assert course_response.status_code == 200
    course = course_response.json()

    card = _create_count_card(client, created_customer, count=1)
    activities = []
    visits = []
    for index, activity_date in enumerate(("2026-07-28", "2026-07-29")):
        activity = client.post("/api/class-records", json={
            "date": activity_date,
            "course_id": f"test-fallback-{index}",
            "course_name": f"内部课程兜底测试{index}",
            "participant_ids": [created_customer["id"]],
        })
        assert activity.status_code == 200
        activities.append(activity.json())

        visit = client.post("/api/visits", json={
            "visit_date": activity_date,
            "customer_id": created_customer["id"],
            "arrived": True,
        })
        assert visit.status_code == 200
        visits.append(visit.json())

    usage = membership_card_service.list_activity_usage_records(created_customer["id"])
    first = next(item for item in usage if item["key"] == f"class:{activities[0]['id']}")
    second = next(item for item in usage if item["key"] == f"class:{activities[1]['id']}")
    assert first["benefit_type"] == "count_card"
    assert second["benefit_type"] == "internal_course"
    assert second["benefit_id"] == course["id"]
    assert first["remaining_after"] == 0
    assert second["remaining_after"] is None

    for visit in visits:
        client.patch(f"/api/visits/{visit['id']}", json={"arrived": False})
    for activity in activities:
        client.delete(f"/api/class-records/{activity['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")
    client.delete(f"/api/internal-courses/{course['id']}")


def test_new_card_backfills_internal_course_usage_in_its_date_range(client, created_customer):
    from app.services import membership_card_service

    course_response = client.post("/api/internal-courses", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "course_type": "疗愈师课程：自爱力构建",
        "price": 3000,
        "effective_date": "2026-01-01",
    })
    assert course_response.status_code == 200
    course = course_response.json()

    activities = []
    for index in range(10):
        activity = client.post("/api/class-records", json={
            "date": "2026-07-30",
            "course_id": f"test-retroactive-card-{index}",
            "course_name": f"后补会员卡回填测试{index}",
            "participant_ids": [created_customer["id"]],
        })
        assert activity.status_code == 200
        activities.append(activity.json())

    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-30",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    usage_before = membership_card_service.list_activity_usage_records(created_customer["id"])
    before = [
        item
        for item in usage_before
        if item["key"] in {f"class:{activity['id']}" for activity in activities}
    ]
    assert len(before) == 10
    assert all(item["benefit_type"] == "internal_course" for item in before)

    card = _create_count_card(client, created_customer, count=12)
    usage_after = membership_card_service.list_activity_usage_records(created_customer["id"])
    after = [
        item
        for item in usage_after
        if item["key"] in {f"class:{activity['id']}" for activity in activities}
    ]
    assert len(after) == 10
    assert all(item["benefit_type"] == "count_card" for item in after)
    assert all(item["card_id"] == card["id"] for item in after)
    assert sorted(item["remaining_after"] for item in after) == list(range(2, 12))

    card_state = client.get(f"/api/membership-cards/{card['id']}")
    assert card_state.status_code == 200
    assert card_state.json()["effective_remaining"] == 2

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    for activity in activities:
        client.delete(f"/api/class-records/{activity['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")
    client.delete(f"/api/internal-courses/{course['id']}")


def test_new_card_does_not_backfill_activity_before_effective_date(client, created_customer):
    from app.services import membership_card_service

    course_response = client.post("/api/internal-courses", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "course_type": "疗愈师课程：自爱力构建",
        "price": 3000,
        "effective_date": "2026-01-01",
    })
    assert course_response.status_code == 200
    course = course_response.json()

    activity = client.post("/api/class-records", json={
        "date": "2026-07-20",
        "course_id": "test-outside-card-range",
        "course_name": "卡生效日前活动测试",
        "participant_ids": [created_customer["id"]],
    })
    assert activity.status_code == 200
    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-20",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    card_response = client.post("/api/membership-cards", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "card_type": "范围测试次卡",
        "price": 500,
        "effective_date": "2026-07-24",
        "total_count": 12,
        "remaining_count": 12,
    })
    assert card_response.status_code == 200
    card = card_response.json()

    usage = membership_card_service.list_activity_usage_records(created_customer["id"])
    record = next(item for item in usage if item["key"] == f"class:{activity.json()['id']}")
    assert record["benefit_type"] == "internal_course"
    assert record["benefit_id"] == course["id"]
    assert record["remaining_after"] is None

    card_state = client.get(f"/api/membership-cards/{card['id']}")
    assert card_state.status_code == 200
    assert card_state.json()["effective_remaining"] == 12

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")
    client.delete(f"/api/internal-courses/{course['id']}")


def test_internal_course_session_never_deducts_card(client, created_customer):
    from app.services import membership_card_service

    card = _create_count_card(client, created_customer)
    session = client.post("/api/internal-course-sessions", json={
        "date": "2026-07-27",
        "course_type": "疗愈师课程",
        "course_name": "内部课程免费测试",
        "participant_ids": [created_customer["id"]],
    })
    assert session.status_code == 200

    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-27",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    usage = membership_card_service.list_activity_usage_records(created_customer["id"])
    assert all(item["key"] != f"ics:{session.json()['id']}" for item in usage)

    card_state = client.get(f"/api/membership-cards/{card['id']}")
    assert card_state.status_code == 200
    assert card_state.json()["effective_remaining"] == 5

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/internal-course-sessions/{session.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_energy_knot_count_applies_after_owner_arrival_and_never_deducts_participant_card(client, created_customer):
    import json
    import uuid

    from app.api.client import _build_special_project_usage_records
    from app.services import membership_card_service

    purchase_response = client.post("/api/energy-knots", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "purchase_count": 5,
        "amount": 1000,
    })
    assert purchase_response.status_code == 200
    purchase = purchase_response.json()

    participant_response = client.post("/api/customers", json={
        "nickname": f"能量结参与者_{uuid.uuid4().hex[:8]}",
    })
    assert participant_response.status_code == 200
    participant = participant_response.json()
    card = _create_count_card(client, participant)

    owner_visit = client.post("/api/visits", json={
        "visit_date": "2026-08-12",
        "customer_id": created_customer["id"],
        "arrived": False,
    })
    assert owner_visit.status_code == 200

    session_response = client.post("/api/energy-knot-sessions", json={
        "date": "2026-08-12",
        "name": "能量结即时销卡测试",
        "owner_id": created_customer["id"],
        "owner_name": created_customer["nickname"],
        "participant_ids": [participant["id"]],
        "description": json.dumps([{
            "id": "",
            "name": "",
            "count": 2,
        }], ensure_ascii=False),
    })
    assert session_response.status_code == 200
    session = session_response.json()

    purchase_state = client.get(f"/api/energy-knots/{purchase['id']}")
    assert purchase_state.status_code == 200
    assert purchase_state.json()["effective_remaining"] == 5

    owner_arrived = client.patch(f"/api/visits/{owner_visit.json()['id']}", json={"arrived": True})
    assert owner_arrived.status_code == 200
    purchase_state = client.get(f"/api/energy-knots/{purchase['id']}")
    assert purchase_state.json()["effective_remaining"] == 3

    records = _build_special_project_usage_records(created_customer["id"])
    record = next(item for item in records if item["project_name"] == "能量结即时销卡测试")
    assert record["count"] == 2
    assert record["remaining_after"] == 3

    visit = client.post("/api/visits", json={
        "visit_date": "2026-08-12",
        "customer_id": participant["id"],
        "arrived": True,
    })
    assert visit.status_code == 200
    usage = membership_card_service.list_activity_usage_records(participant["id"])
    assert all(not item["key"].startswith(f"eks:{session['id']}") for item in usage)
    assert client.get(f"/api/membership-cards/{card['id']}").json()["effective_remaining"] == 5

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.patch(f"/api/visits/{owner_visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/energy-knot-sessions/{session['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")
    client.delete(f"/api/customers/{participant['id']}")
    client.delete(f"/api/energy-knots/{purchase['id']}")


def test_special_project_usage_appears_after_owner_arrival(client, created_customer):
    from app.api.client import _build_special_project_usage_records

    configs = [
        ("group-cases", "group-case-sessions", "觉醒游戏"),
        ("emotional-releases", "emotional-release-sessions", "情绪释放"),
    ]
    for index, (project_path, session_path, type_label) in enumerate(configs, start=1):
        purchase_response = client.post(f"/api/{project_path}", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "purchase_count": 2,
            "amount": 2000,
        })
        assert purchase_response.status_code == 200
        purchase = purchase_response.json()

        activity_name = f"{type_label}立即扣次测试"
        activity_date = f"2026-07-{26 + index:02d}"
        visit = client.post("/api/visits", json={
            "visit_date": activity_date,
            "customer_id": created_customer["id"],
            "arrived": False,
        })
        assert visit.status_code == 200
        session_response = client.post(f"/api/{session_path}", json={
            "date": activity_date,
            "name": activity_name,
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert session_response.status_code == 200
        session = session_response.json()

        purchase_state = client.get(f"/api/{project_path}/{purchase['id']}")
        assert purchase_state.json()["effective_remaining"] == 2

        records = _build_special_project_usage_records(created_customer["id"])
        assert all(item["project_name"] != activity_name for item in records)

        arrived = client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": True})
        assert arrived.status_code == 200
        purchase_state = client.get(f"/api/{project_path}/{purchase['id']}")
        assert purchase_state.json()["effective_remaining"] == 1

        records = _build_special_project_usage_records(created_customer["id"])
        record = next(item for item in records if item["project_name"] == activity_name)
        assert record["source"] == "project_activity"
        assert record["project_type"] == project_path
        assert record["benefit_name"] == f"{type_label}次数"
        assert record["count"] == 1
        assert record["remaining_after"] == 1
        assert record["activity_role"] == "案主"
        assert record["reason"] == f"案主已到场，使用{type_label}"

        client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
        client.delete(f"/api/{session_path}/{session['id']}")
        restored_state = client.get(f"/api/{project_path}/{purchase['id']}")
        assert restored_state.json()["effective_remaining"] == 2
        client.delete(f"/api/{project_path}/{purchase['id']}")


def test_unpurchased_special_project_usage_keeps_negative_remaining(client, created_customer):
    from app.api.client import _build_special_project_usage_records

    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-28",
        "customer_id": created_customer["id"],
        "arrived": False,
    })
    assert visit.status_code == 200

    session_response = client.post("/api/group-case-sessions", json={
        "date": "2026-07-28",
        "name": "未购买专项负数记录",
        "owner_id": created_customer["id"],
        "owner_name": created_customer["nickname"],
    })
    assert session_response.status_code == 200
    session = session_response.json()

    arrived = client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": True})
    assert arrived.status_code == 200

    records = _build_special_project_usage_records(created_customer["id"])
    record = next(item for item in records if item["project_name"] == "未购买专项负数记录")
    assert record["project_type"] == "group-cases"
    assert record["benefit_name"] == "预支扣卡"
    assert record["benefit_type"] == "unpaid_special_project"
    assert record["remaining_after"] == -1

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/group-case-sessions/{session['id']}")


def test_special_project_usage_records_keep_per_activity_balance_and_skip_absence(
    client,
    created_customer,
):
    from app.api.client import _build_special_project_usage_records

    customer_id = created_customer["id"]
    purchase_response = client.post("/api/group-cases", json={
        "customer_id": customer_id,
        "nickname": created_customer["nickname"],
        "purchase_count": 2,
        "amount": 2000,
    })
    assert purchase_response.status_code == 200
    purchase = purchase_response.json()

    sessions = []
    visits = []
    for index in range(4):
        activity_date = f"2026-09-{index + 1:02d}"
        visit_response = client.post("/api/visits", json={
            "visit_date": activity_date,
            "customer_id": customer_id,
            "arrived": False,
        })
        assert visit_response.status_code == 200
        visits.append(visit_response.json())

        session_response = client.post("/api/group-case-sessions", json={
            "date": activity_date,
            "name": f"专项历史余额测试{index + 1}",
            "owner_id": customer_id,
            "owner_name": created_customer["nickname"],
        })
        assert session_response.status_code == 200
        sessions.append(session_response.json())

    for visit in visits[:3]:
        arrived = client.patch(f"/api/visits/{visit['id']}", json={"arrived": True})
        assert arrived.status_code == 200

    records = _build_special_project_usage_records(customer_id)
    test_records = {
        item["deduction_date"]: item
        for item in records
        if item["project_name"].startswith("专项历史余额测试")
    }
    assert set(test_records) == {"2026-09-01", "2026-09-02", "2026-09-03"}
    assert test_records["2026-09-01"]["remaining_after"] == 1
    assert test_records["2026-09-02"]["remaining_after"] == 0
    assert test_records["2026-09-03"]["remaining_after"] == -1
    assert test_records["2026-09-03"]["benefit_name"] == "预支扣卡"
    assert test_records["2026-09-03"]["benefit_type"] == "unpaid_special_project"

    for visit in visits[:3]:
        client.patch(f"/api/visits/{visit['id']}", json={"arrived": False})
    for session in sessions:
        client.delete(f"/api/group-case-sessions/{session['id']}")
    client.delete(f"/api/group-cases/{purchase['id']}")
