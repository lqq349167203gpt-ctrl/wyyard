import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


def _create_organization_course(client, course_name: str):
    suffix = uuid.uuid4().hex[:8]
    organization = client.post(
        "/api/organizations",
        json={"name": f"粗门测试组织_{suffix}", "member_ids": []},
    ).json()
    course = client.post(
        "/api/courses",
        json={
            "type": "沙龙活动",
            "name": course_name,
            "organization_id": organization["id"],
        },
    ).json()
    return organization, course


def test_coarse_door_delete_follows_payment_creator_scope(monkeypatch):
    from app.services import position_edit_permission_service
    from app.utils.record_ownership import ensure_payment_record_manager

    request = SimpleNamespace(state=SimpleNamespace(
        user_roles=["员工"],
        user_role="员工",
        user_id="account-other",
        user_owner="其他员工",
        user_name="other",
    ))
    own_record = SimpleNamespace(created_by_id="account-other", created_by="其他员工")
    other_record = SimpleNamespace(created_by_id="account-creator", created_by="创建员工")

    monkeypatch.setattr(
        position_edit_permission_service,
        "get_permissions",
        lambda _roles: {"payments": "own"},
    )
    ensure_payment_record_manager(request, own_record)
    with pytest.raises(HTTPException, match="只能修改或删除自己创建的付费记录") as error:
        ensure_payment_record_manager(request, other_record)
    assert error.value.status_code == 403

    monkeypatch.setattr(
        position_edit_permission_service,
        "get_permissions",
        lambda _roles: {"payments": "all"},
    )
    ensure_payment_record_manager(request, other_record)


def test_coarse_door_card_deducts_each_course_once_without_precreated_card(client, created_customer):
    from app.services import membership_card_service

    course_date = "2026-09-01"
    deal_date = "2026-09-05"
    organization, course = _create_organization_course(client, "粗门体验课")
    settlement_organization = client.post(
        "/api/organizations",
        json={"name": f"粗门结算组织_{uuid.uuid4().hex[:8]}", "member_ids": []},
    ).json()
    visit_response = client.post(
        "/api/visits",
        json={
            "visit_date": course_date,
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "arrived": True,
        },
    )
    assert visit_response.status_code == 200
    visit_id = visit_response.json()["id"]

    activity_response = client.post(
        "/api/class-records",
        json={
            "date": course_date,
            "start_time": "09:00",
            "course_id": course["id"],
            "course_name": "粗门体验课",
            "course_type": "沙龙活动",
            "participant_ids": [created_customer["id"]],
            "space_id": "space-test",
            "space_name": "测试空间",
        },
    )
    assert activity_response.status_code == 200
    activity_id = activity_response.json()["id"]
    assert membership_card_service.get_debt(created_customer["id"]) == 1

    options_response = client.get(
        "/api/project-deductions/coarse-door-options",
        params={"customer_id": created_customer["id"]},
    )
    assert options_response.status_code == 200
    options = options_response.json()
    assert options["organizations"] == [{"id": organization["id"], "name": organization["name"]}]
    assert options["course_organizations"] == options["organizations"]
    assert {
        "id": settlement_organization["id"],
        "name": settlement_organization["name"],
    } in options["settlement_organizations"]
    assert any(item["record_id"] == activity_id for item in options["courses"])

    deduction_response = client.post(
        "/api/project-deductions/coarse-door-course",
        json={
            "customer_id": created_customer["id"],
            "record_type": "class",
            "record_id": activity_id,
            "course_organization_id": organization["id"],
            "settlement_organization_id": settlement_organization["id"],
            "deal_date": deal_date,
            "closers": [
                {"id": "closer-a", "name": "成交人甲", "amount": 0},
                {"id": "closer-b", "name": "成交人乙", "amount": 0},
            ],
            "notes": "粗门抵扣备注",
        },
    )
    assert deduction_response.status_code == 200
    deduction = deduction_response.json()
    assert deduction["project_id"] == f"coarse:class:{activity_id}"
    assert deduction["source_activity_id"] == activity_id
    assert deduction["deduction_date"] == deal_date
    assert deduction["source_activity_date"] == course_date
    assert deduction["closer_name"] == "成交人甲"
    assert [item["name"] for item in deduction["closers"]] == ["成交人甲", "成交人乙"]
    assert deduction["notes"] == "粗门抵扣备注"
    assert deduction["source_organization_id"] == organization["id"]
    assert deduction["source_organization_name"] == organization["name"]
    assert deduction["organization_id"] == settlement_organization["id"]
    assert deduction["organization_name"] == settlement_organization["name"]
    assert deduction["source_space_id"] == "space-test"
    assert deduction["source_space_name"] == "测试空间"
    assert membership_card_service.get_debt(created_customer["id"]) == 0
    detail = client.get(f"/api/customer-detail/{created_customer['id']}")
    activity_row = next(
        item for item in detail.json()["activities"]
        if item["activity_key"] == f"class:{activity_id}"
    )
    assert activity_row["deduction_summary"] == "粗门扣卡1次"
    transaction_row = next(
        item for item in detail.json()["payment_records"]
        if item["source_id"] == deduction["id"]
    )
    assert transaction_row["type"] == "粗门扣卡"
    assert transaction_row["name"] == f"{organization['name']} · 粗门体验课"
    assert transaction_row["activity_name"] == "粗门体验课"
    assert transaction_row["course_organization_name"] == organization["name"]
    assert transaction_row["settlement_organization_name"] == settlement_organization["name"]
    assert transaction_row["quantity"] == 1
    assert transaction_row["deal_date"] == deal_date
    assert transaction_row["effective_date"] == course_date
    assert transaction_row["closer_name"] == "成交人甲, 成交人乙"

    duplicate_response = client.post(
        "/api/project-deductions/coarse-door-course",
        json={
            "customer_id": created_customer["id"],
            "record_type": "class",
            "record_id": activity_id,
            "course_organization_id": organization["id"],
            "settlement_organization_id": settlement_organization["id"],
            "deal_date": deal_date,
            "closers": [],
            "notes": "",
        },
    )
    assert duplicate_response.status_code == 400

    after_response = client.get(
        "/api/project-deductions/coarse-door-options",
        params={"customer_id": created_customer["id"]},
    )
    assert all(item["record_id"] != activity_id for item in after_response.json()["courses"])

    client.delete(f'/api/project-deductions/{deduction["id"]}')
    assert membership_card_service.get_debt(created_customer["id"]) == 1
    detail_after_delete = client.get(f"/api/customer-detail/{created_customer['id']}").json()
    assert all(
        item["source_id"] != deduction["id"]
        for item in detail_after_delete["payment_records"]
    )
    client.delete(f"/api/class-records/{activity_id}")
    client.delete(f"/api/visits/{visit_id}")
    client.delete(f'/api/courses/{course["id"]}')
    client.delete(f'/api/organizations/{organization["id"]}')
    client.delete(f'/api/organizations/{settlement_organization["id"]}')


def test_coarse_door_card_returns_all_original_card_deductions(client, created_customer):
    from app.services import membership_card_service

    course_date = "2026-09-02"
    organization, course = _create_organization_course(client, "双次课程")
    normal_card = client.post(
        "/api/membership-cards",
        headers={"x-client-type": "pc"},
        json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "次卡",
            "price": 0,
            "effective_date": "2026-08-01",
            "duration_type": "month",
            "duration_value": 3,
            "remaining_count": 5,
            "closers": [],
        },
    ).json()
    client.post(
        "/api/visits",
        json={
            "visit_date": course_date,
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "arrived": True,
        },
    )
    activity = client.post(
        "/api/class-records",
        json={
            "date": course_date,
            "start_time": "09:00",
            "course_id": course["id"],
            "course_name": "双次课程",
            "course_type": "沙龙活动",
            "membership_deduction_count": 2,
            "participant_ids": [created_customer["id"]],
            "space_id": "space-test",
            "space_name": "无忧小院",
        },
    ).json()
    assert membership_card_service.get_card_effective_remaining(normal_card["id"]) == 3

    options = client.get(
        "/api/project-deductions/coarse-door-options",
        params={"customer_id": created_customer["id"]},
    ).json()
    option = next(item for item in options["courses"] if item["record_id"] == activity["id"])
    assert option["deduction_count"] == 2
    assert options["organizations"] == [{"id": organization["id"], "name": organization["name"]}]

    response = client.post(
        "/api/project-deductions/coarse-door-course",
        json={
            "customer_id": created_customer["id"],
            "record_type": "class",
            "record_id": activity["id"],
            "organization_id": organization["id"],
        },
    )
    assert response.status_code == 200
    deduction = response.json()
    assert deduction["count"] == 2
    manual_records = client.get("/api/project-deductions", params={
        "customer_id": created_customer["id"], "manual_only": True, "page": 1, "page_size": 10,
    })
    assert manual_records.status_code == 200
    assert all(item["project_name"] != "粗门次卡" for item in manual_records.json()["items"])
    dedicated_records = client.get("/api/project-deductions", params={
        "customer_id": created_customer["id"], "card_type": "粗门次卡",
    })
    assert any(item["id"] == deduction["id"] for item in dedicated_records.json())
    assert membership_card_service.get_card_effective_remaining(normal_card["id"]) == 5
    detail = client.get(f"/api/customer-detail/{created_customer['id']}")
    activity_row = next(
        item for item in detail.json()["activities"]
        if item["activity_key"] == f"class:{activity['id']}"
    )
    assert activity_row["deduction_summary"] == "粗门扣卡2次"
    transaction_row = next(
        item for item in detail.json()["payment_records"]
        if item["source_id"] == deduction["id"]
    )
    assert transaction_row["type"] == "粗门扣卡"
    assert transaction_row["quantity"] == 2

    client.delete(f'/api/project-deductions/{deduction["id"]}')
    assert membership_card_service.get_card_effective_remaining(normal_card["id"]) == 3
    client.delete(f'/api/class-records/{activity["id"]}')
    client.delete(f'/api/courses/{course["id"]}')
    client.delete(f'/api/organizations/{organization["id"]}')


def test_coarse_door_options_exclude_zero_deduction_courses(client, created_customer):
    course_date = "2026-09-03"
    client.post(
        "/api/visits",
        json={
            "visit_date": course_date,
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "arrived": True,
        },
    )
    activity = client.post(
        "/api/class-records",
        json={
            "date": course_date,
            "course_id": "coarse-door-zero-count-course",
            "course_name": "零次课程",
            "course_type": "沙龙活动",
            "membership_deduction_count": 0,
            "participant_ids": [created_customer["id"]],
            "space_id": "space-test",
            "space_name": "无忧小院",
        },
    ).json()

    options = client.get(
        "/api/project-deductions/coarse-door-options",
        params={"customer_id": created_customer["id"]},
    ).json()
    assert all(item["record_id"] != activity["id"] for item in options["courses"])
