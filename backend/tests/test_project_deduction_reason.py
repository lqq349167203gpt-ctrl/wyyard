"""销卡原因与活动扣卡触发条件测试。"""


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

    visit = client.post("/api/visits", json={
        "visit_date": activity_date,
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    after_arrival = client.get(f"/api/membership-cards/{card['id']}")
    assert after_arrival.status_code == 200
    assert after_arrival.json()["effective_remaining"] == 4

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/class-records/{activity.json()['id']}")
    client.delete(f"/api/membership-cards/{card['id']}")


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


def test_special_project_usage_appears_only_after_arrival(client, created_customer):
    from app.api.client import _build_special_project_usage_records

    purchase_response = client.post("/api/group-cases", json={
        "customer_id": created_customer["id"],
        "nickname": created_customer["nickname"],
        "purchase_count": 2,
        "amount": 2000,
    })
    assert purchase_response.status_code == 200
    purchase = purchase_response.json()

    session_response = client.post("/api/group-case-sessions", json={
        "date": "2026-07-27",
        "name": "觉醒游戏专项记录测试",
        "owner_id": created_customer["id"],
        "owner_name": created_customer["nickname"],
    })
    assert session_response.status_code == 200
    session = session_response.json()

    assert _build_special_project_usage_records(created_customer["id"]) == []
    before_arrival = client.get(f"/api/group-cases/{purchase['id']}")
    assert before_arrival.json()["effective_remaining"] == 2

    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-27",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    records = _build_special_project_usage_records(created_customer["id"])
    record = next(item for item in records if item["project_name"] == "觉醒游戏专项记录测试")
    assert record["source"] == "project_activity"
    assert record["project_type"] == "group-cases"
    assert record["benefit_name"] == "觉醒游戏次数"
    assert record["count"] == 1
    assert record["remaining_after"] == 1

    after_arrival = client.get(f"/api/group-cases/{purchase['id']}")
    assert after_arrival.json()["effective_remaining"] == 1

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/group-case-sessions/{session['id']}")
    client.delete(f"/api/group-cases/{purchase['id']}")


def test_unpurchased_special_project_usage_keeps_negative_remaining(client, created_customer):
    from app.api.client import _build_special_project_usage_records

    session_response = client.post("/api/group-case-sessions", json={
        "date": "2026-07-28",
        "name": "未购买专项负数记录",
        "owner_id": created_customer["id"],
        "owner_name": created_customer["nickname"],
    })
    assert session_response.status_code == 200
    session = session_response.json()

    visit = client.post("/api/visits", json={
        "visit_date": "2026-07-28",
        "customer_id": created_customer["id"],
        "arrived": True,
    })
    assert visit.status_code == 200

    records = _build_special_project_usage_records(created_customer["id"])
    record = next(item for item in records if item["project_name"] == "未购买专项负数记录")
    assert record["project_type"] == "group-cases"
    assert record["benefit_name"] == "未购买"
    assert record["benefit_type"] == "unpaid_special_project"
    assert record["remaining_after"] == -1

    client.patch(f"/api/visits/{visit.json()['id']}", json={"arrived": False})
    client.delete(f"/api/group-case-sessions/{session['id']}")
