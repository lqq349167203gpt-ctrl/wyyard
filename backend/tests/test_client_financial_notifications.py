"""客户端购买与销卡消息通知测试。"""

from datetime import datetime, timezone

from app.middleware.jwt_auth import create_customer_token


def _customer_headers(customer: dict) -> dict:
    token = create_customer_token(customer["id"], customer["nickname"])
    return {"Authorization": f"Bearer {token}"}


def test_purchase_syncs_but_manual_deduction_is_hidden_from_notifications(client, created_customer):
    card_response = client.post("/api/membership-cards", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "card_type": "消息通知测试卡",
        "price": 300,
        "effective_date": "2026-01-01",
        "total_count": 3,
        "remaining_count": 3,
        "closer_name": "测试经办人",
    })
    assert card_response.status_code == 200
    card = card_response.json()

    deduction_response = client.post("/api/project-deductions", json={
        "customer_id": created_customer["id"],
        "project_type": "membership-cards",
        "project_id": card["id"],
        "count": 1,
        "reason": "消息通知销卡内容",
        "created_by": "测试员工",
    })
    assert deduction_response.status_code == 200
    deduction = deduction_response.json()

    headers = _customer_headers(created_customer)
    response = client.get("/api/client/notifications", headers=headers)
    assert response.status_code == 200
    items = response.json()["items"]

    purchase = next(item for item in items if item["title"] == "购买信息")
    assert "消息通知测试卡" in purchase["content"]
    assert "购买数量：1 次" in purchase["content"]
    assert "支付金额：¥300" in purchase["content"]

    assert not any(item["type"] == "deduction" for item in items)

    repeated = client.get("/api/client/notifications", headers=headers)
    assert len(repeated.json()["items"]) == len(items)

    client.delete(f"/api/project-deductions/{deduction['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


def test_activity_deductions_are_replaced_by_activity_arrangement_notifications(
    client,
    created_customer,
):
    card_response = client.post("/api/membership-cards", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "card_type": "活动消息测试卡",
        "price": 300,
        "effective_date": "2026-01-01",
        "total_count": 3,
        "remaining_count": 3,
    })
    assert card_response.status_code == 200
    card = card_response.json()

    activity_response = client.post("/api/class-records", json={
        "date": "2026-07-29",
        "course_id": "notification-test-course",
        "course_name": "活动通知测试",
        "participant_ids": [created_customer["id"]],
        "is_public_welfare": False,
    })
    assert activity_response.status_code == 200
    activity = activity_response.json()

    visit_response = client.post("/api/visits", json={
        "visit_date": "2026-07-29",
        "customer_id": created_customer["id"],
        "arrived": False,
    })
    assert visit_response.status_code == 200
    visit = visit_response.json()

    session_response = client.post("/api/group-case-sessions", json={
        "date": "2026-07-29",
        "name": "未购买觉醒游戏通知",
        "owner_id": created_customer["id"],
        "owner_name": created_customer["nickname"],
    })
    assert session_response.status_code == 200
    session = session_response.json()

    visit_response = client.patch(f"/api/visits/{visit['id']}", json={"arrived": True})
    assert visit_response.status_code == 200

    response = client.get(
        "/api/client/notifications",
        headers=_customer_headers(created_customer),
    )
    assert response.status_code == 200
    items = response.json()["items"]

    assert not any(item["type"] == "deduction" for item in items)

    activity_notification = next(
        item
        for item in items
        if item["title"] == "活动安排"
        and item["activity_name"] == "活动通知测试"
    )
    assert "活动名称：活动通知测试" in activity_notification["content"]
    assert "身份：参与者" in activity_notification["content"]
    assert activity_notification["activity_date"] == "2026-07-29"
    sent_at = datetime.fromisoformat(activity_notification["created_at"].replace("Z", "+00:00"))
    assert (datetime.now(timezone.utc) - sent_at).total_seconds() < 60

    project_notification = next(
        item
        for item in items
        if item["title"] == "活动安排"
        and item["activity_name"] == "未购买觉醒游戏通知"
    )
    assert "活动名称：未购买觉醒游戏通知" in project_notification["content"]
    assert "身份：案主" in project_notification["content"]
    assert project_notification["activity_date"] == "2026-07-29"

    client.patch(f"/api/visits/{visit['id']}", json={"arrived": False})
    client.delete(f"/api/group-case-sessions/{session['id']}")
    client.delete(f"/api/class-records/{activity['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")
