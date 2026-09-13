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


def test_edit_coarse_course_preserves_identity_and_rolls_back(client, created_customer, monkeypatch):
    from app.services import membership_card_service, project_deduction_service, storage

    customer_id = created_customer["id"]
    org, course = _create_organization_course(client, "换课验证")
    visit = client.post("/api/visits", json={"visit_date": "2026-09-01", "customer_id": customer_id, "nickname": created_customer["nickname"], "arrived": True}).json()
    lessons = [client.post("/api/class-records", json={"date": "2026-09-01", "start_time": time, "course_id": course["id"], "course_name": "换课验证", "course_type": "沙龙活动", "participant_ids": [customer_id]}).json() for time in ("09:00", "14:00")]
    payload = {"customer_id": customer_id, "record_type": "class", "record_id": lessons[0]["id"], "course_organization_id": org["id"], "settlement_organization_id": org["id"], "deal_date": "2026-09-01", "closers": []}
    original_response = client.post("/api/project-deductions/coarse-door-course", json=payload)
    assert original_response.status_code == 200, original_response.text
    original = original_response.json()
    path = f'/api/project-deductions/coarse-door-course/{original["id"]}'
    try:
        options = client.get("/api/project-deductions/coarse-door-options", params={"customer_id": customer_id, "editing_id": original["id"]}).json()
        assert {row["record_id"] for row in options["courses"]} >= {row["id"] for row in lessons}
        payload.update(deal_date="2026-09-03", closers=[{"id": customer_id, "name": "成交人甲", "amount": 0}, {"id": "", "name": "成交人乙", "amount": 0}], notes="编辑备注")
        updated = client.patch(path, json=payload)
        assert updated.status_code == 200, updated.text
        assert updated.json()["created_by"] == original["created_by"]
        assert updated.json()["created_at"] == original["created_at"]
        assert updated.json()["deduction_date"] == "2026-09-03"
        assert len(updated.json()["closers"]) == 2
        assert updated.json()["notes"] == "编辑备注"
        assert membership_card_service.get_debt(customer_id) == 1
        payload.update(record_id=lessons[1]["id"], closers=[])
        with monkeypatch.context() as patch:
            def fail_commit(*args):
                raise RuntimeError("模拟换课提交失败")
            patch.setattr(storage, "commit_pending_writes", fail_commit)
            with pytest.raises(Exception, match="模拟换课提交失败"):
                client.patch(path, json=payload)
        assert project_deduction_service._deductions[original["id"]].source_activity_id == lessons[0]["id"]
        assert storage.load_item("project_deductions.json", original["id"])["source_activity_id"] == lessons[0]["id"]
        assert membership_card_service.get_debt(customer_id) == 1
        updated = client.patch(path, json=payload)
        assert updated.status_code == 200, updated.text
        assert updated.json()["id"] == original["id"]
        assert updated.json()["source_activity_id"] == lessons[1]["id"]
        assert updated.json()["closers"] == []
        assert membership_card_service.get_debt(customer_id) == 1
        other = client.post("/api/project-deductions/coarse-door-course", json={**payload, "record_id": lessons[0]["id"]})
        assert other.status_code == 200, other.text
        assert client.patch(path, json={**payload, "record_id": lessons[0]["id"]}).status_code == 400
        assert project_deduction_service._deductions[original["id"]].source_activity_id == lessons[1]["id"]
        assert client.delete(f'/api/project-deductions/{other.json()["id"]}').status_code == 200
        assert client.patch(path, json={**payload, "customer_id": "other"}).status_code == 400
        with monkeypatch.context() as patch:
            from app.api import project_deductions
            def denied(*args):
                raise HTTPException(403, "仅能修改自己创建的记录")
            patch.setattr(project_deductions, "ensure_payment_record_manager", denied)
            assert client.patch(path, json=payload).status_code == 403
        # 移除旧课程不取消已换课记录；移除新课程才取消。
        assert client.patch(f'/api/class-records/{lessons[0]["id"]}/participants', json={"participant_ids": []}).status_code == 200
        assert not project_deduction_service._deductions[original["id"]].cancelled
        assert client.patch(f'/api/class-records/{lessons[1]["id"]}/participants?confirm_coarse_cancellation=1', json={"participant_ids": []}).status_code == 200
        assert project_deduction_service._deductions[original["id"]].cancelled
        assert client.patch(path, json=payload).status_code in (400, 404)
    finally:
        for lesson in lessons:
            client.delete(f'/api/class-records/{lesson["id"]}?confirm_coarse_cancellation=1')
        client.delete(f'/api/visits/{visit["id"]}?confirm_coarse_cancellation=1')
        client.delete(f'/api/courses/{course["id"]}')
        client.delete(f'/api/organizations/{org["id"]}')


@pytest.mark.parametrize("withdraw", [False, True])
def test_removing_participant_cancels_coarse_with_confirmation_and_rollback(client, created_customer, monkeypatch, withdraw):
    from app.services import class_record_service, membership_card_service, project_deduction_service, storage

    customer_id = created_customer["id"]
    org, course = _create_organization_course(client, "取消联动课")
    visit = client.post("/api/visits", json={"visit_date": "2026-09-01", "customer_id": customer_id, "nickname": created_customer["nickname"], "arrived": True}).json()
    lesson = client.post("/api/class-records", json={"date": "2026-09-01", "start_time": "09:00", "course_id": course["id"], "course_name": "取消联动课", "course_type": "沙龙活动", "participant_ids": [customer_id]}).json()
    response = client.post("/api/project-deductions/coarse-door-course", json={"customer_id": customer_id, "record_type": "class", "record_id": lesson["id"], "course_organization_id": org["id"], "settlement_organization_id": org["id"], "deal_date": "2026-09-01", "closers": []})
    assert response.status_code == 200, response.text
    deduction_id = response.json()["id"]
    path = f'/api/class-records/{lesson["id"]}/participants'
    def remove(confirm=False):
        target = f'/api/activity-withdrawals/class/{lesson["id"]}' if withdraw else path
        return client.request("POST" if withdraw else "PATCH", target + ("?confirm_coarse_cancellation=1" if confirm else ""), json={"customer_id": customer_id} if withdraw else {"participant_ids": []})
    try:
        preview = remove()
        assert preview.status_code == 409 and preview.json()["coarse_cancellation_required"]
        # 弹窗要说清楚是谁的抵扣：文案和结构化数据都要带客户名
        assert preview.json()["coarse_cancellation_items"] == [{
            "nickname": created_customer["nickname"], "activity": "取消联动课", "count": 1,
        }]
        assert created_customer["nickname"] in preview.json()["detail"]
        assert customer_id in class_record_service.get_record(lesson["id"]).participant_ids
        assert customer_id in storage.load_item("class_records.json", lesson["id"])["participant_ids"]
        assert not project_deduction_service._deductions[deduction_id].cancelled
        # 无撤销权限，确认也不能只改名单。
        from app.utils import record_ownership
        with monkeypatch.context() as patch:
            def denied(*args):
                raise HTTPException(403, "只能取消自己创建的抵扣")
            patch.setattr(record_ownership, "ensure_payment_record_manager", denied)
            rejected = remove(True)
            assert rejected.status_code == 403
        assert customer_id in class_record_service.get_record(lesson["id"]).participant_ids
        # 数据库提交失败：内存与数据库都维持原状态。
        with monkeypatch.context() as patch:
            def fail_commit(*args):
                raise RuntimeError("模拟提交失败")
            patch.setattr(storage, "commit_pending_writes", fail_commit)
            with pytest.raises(Exception, match="模拟提交失败"):
                remove(True)
        assert customer_id in class_record_service.get_record(lesson["id"]).participant_ids
        assert not storage.load_item("project_deductions.json", deduction_id)["cancelled"]
        done = remove(True)
        assert done.status_code == 200, done.text
        assert storage.load_item("project_deductions.json", deduction_id)["cancelled"]
        assert membership_card_service.get_debt(customer_id) == 0
        assert not project_deduction_service.list_deductions(customer_id)
        detail = client.get(f"/api/customer-detail/{customer_id}").json()
        cancelled = next(row for row in detail["payment_records"] if row["source_id"] == deduction_id)
        assert cancelled["cancelled"] and "移除" in cancelled["cancellation_reason"]
        assert detail["customer"]["transaction_count"] == 0
        # 重复请求不重复退回；重加人员不恢复旧抵扣。
        assert remove(True).status_code == 200
        if withdraw:
            assert client.delete(f'/api/activity-withdrawals/class/{lesson["id"]}/{customer_id}').status_code == 200
        else:
            assert client.patch(path, json={"participant_ids": [customer_id]}).status_code == 200
        assert project_deduction_service._deductions[deduction_id].cancelled
        assert membership_card_service.get_debt(customer_id) == 1
        options = project_deduction_service.get_coarse_door_options(customer_id)
        assert any(row["record_id"] == lesson["id"] for row in options["courses"])
    finally:
        client.delete(f'/api/class-records/{lesson["id"]}?confirm_coarse_cancellation=1')
        client.delete(f'/api/visits/{visit["id"]}?confirm_coarse_cancellation=1')
        client.delete(f'/api/courses/{course["id"]}')
        client.delete(f'/api/organizations/{org["id"]}')


def test_course_transaction_rolls_back_earlier_database_writes():
    from app.services import storage
    key = "atomic-test-" + uuid.uuid4().hex
    with pytest.raises(TypeError):
        storage.commit_pending_writes([
            ("item", "project_deductions.json", key, {"test": True}),
            ("item", "project_deductions.json", key + "-bad", {"invalid": object()}),
        ])
    assert storage.load_item("project_deductions.json", key) is None


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
    edited = client.patch(f'/api/project-deductions/coarse-door-course/{deduction["id"]}', json={
        "customer_id": created_customer["id"], "record_type": "class", "record_id": activity["id"],
        "course_organization_id": organization["id"], "deal_date": "2026-09-03", "closers": [], "notes": "仅改备注与日期",
    })
    assert edited.status_code == 200, edited.text
    assert edited.json()["id"] == deduction["id"]
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
