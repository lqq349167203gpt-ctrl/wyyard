"""组织信息：成员/引流人名字由服务端解析"""
import uuid


def _unique():
    return uuid.uuid4().hex[:12]


def test_organization_members_are_resolved_server_side(client):
    """成员与引流人的名字随组织接口返回，不依赖当前账号的客户可见范围。"""
    nickname = f"成员_{_unique()}"
    customer = client.post("/api/customers", json={"nickname": nickname, "name": "测试"}).json()
    org_name = f"组织_{_unique()}"
    created = client.post("/api/organizations", json={
        "name": org_name,
        "member_ids": [customer["id"]],
        "referrer_mode": "selected",
        "referrer_ids": [customer["id"]],
    })
    assert created.status_code == 200, created.text
    org_id = created.json()["id"]

    try:
        orgs = client.get("/api/organizations").json()
        org = next(item for item in orgs if item["id"] == org_id)
        assert [member["nickname"] for member in org["members"]] == [nickname]
        assert all(member["missing"] is False for member in org["members"])
        assert [referrer["nickname"] for referrer in org["referrers"]] == [nickname]
        assert isinstance(org["data_viewers"], list)
    finally:
        client.delete(f"/api/organizations/{org_id}")
        client.delete(f"/api/customers/{customer['id']}")


def test_archive_preserves_configuration_storage_metadata_and_history(client):
    from app.services import organization_service, storage

    customer = client.post("/api/customers", json={"nickname": f"归档成员_{_unique()}"}).json()
    org = client.post("/api/organizations", json={
        "name": f"归档俱乐部_{_unique()}", "member_ids": [customer["id"]],
        "referrer_mode": "selected", "referrer_ids": [customer["id"]],
        "include_unassigned_referrers": False, "sort_order": 901,
    }).json()
    org_id = org["id"]
    course_type = f"归档课程_{_unique()}"
    assert client.post("/api/course-types", json={"name": course_type, "organization_id": org_id}).status_code == 200
    course = client.post("/api/class-records", json={"date": "2026-10-01", "course_id": course_type,
        "course_name": course_type, "course_type": course_type, "participant_ids": [customer["id"]],
        "membership_deduction_count": 0})
    assert course.status_code == 200, course.text
    query = {"organization_id": org_id, "date_from": "2026-01-01", "date_to": "2026-12-31"}
    before = client.post("/api/principal/query", json=query)
    assert before.status_code == 200, before.text
    assert before.json()["summary"]["课程数"] >= 1
    all_before = client.post("/api/principal/query", json={**query, "organization_id": ""}).json()
    archived = client.post(f"/api/organizations/{org_id}/archive", json={"stopped_on": "2026-10-18", "reason": " 停止运营 "})
    assert archived.status_code == 200, archived.text
    result = archived.json()
    assert result["status"] == "archived" and result["archive_reason"] == "停止运营"
    assert result["stopped_on"] == "2026-10-18" and result["archived_at"]
    for key in ("name", "member_ids", "referrer_mode", "referrer_ids", "include_unassigned_referrers", "sort_order"):
        assert result[key] == org[key]
    stored = storage.load_item("organizations.json", org_id)
    assert stored["status"] == "archived" and stored["member_ids"] == [customer["id"]]
    assert organization_service.get_organization(org_id).status == "archived"
    assert org_id in {item["id"] for item in client.get("/api/organizations").json()}
    assert org_id not in {item["id"] for item in client.get("/api/organizations?status=active").json()}
    assert org_id in {item["id"] for item in client.get("/api/organizations?status=archived").json()}
    for suffix in ("", "?lite=true"):
        metadata = client.get("/api/principal/metadata" + suffix).json()
        assert next(row for row in metadata["organizations"] if row["id"] == org_id)["status"] == "archived"
    after = client.post("/api/principal/query", json=query)
    assert after.status_code == 200, after.text
    assert after.json()["summary"] == before.json()["summary"]
    assert client.post("/api/principal/query", json={**query, "organization_id": ""}).json()["summary"] == all_before["summary"]
    assert client.patch(f"/api/organizations/{org_id}", json={"member_ids": []}).status_code == 409
    assert client.delete(f"/api/organizations/{org_id}").status_code == 409
    assert client.post(f"/api/organizations/{org_id}/archive", json={"stopped_on": "2026-10-19"}).json()["stopped_on"] == "2026-10-18"
    restored = client.post(f"/api/organizations/{org_id}/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["status"] == "active" and restored.json()["stopped_on"] is None
    assert restored.json()["member_ids"] == org["member_ids"]
    assert client.patch(f"/api/organizations/{org_id}", json={"sort_order": 902}).status_code == 200
    assert org_id in {item["id"] for item in client.get("/api/organizations?status=active").json()}


def test_archive_validation_and_status_cannot_bypass_action(client):
    org = client.post("/api/organizations", json={"name": f"归档校验_{_unique()}"}).json()
    url = f"/api/organizations/{org['id']}"
    assert client.post(url + "/archive", json={"stopped_on": "invalid"}).status_code == 422
    assert client.post(url + "/archive", json={"stopped_on": "2026-10-18", "reason": "字" * 501}).status_code == 422
    assert client.patch(url, json={"status": "archived"}).status_code == 409
    assert client.post("/api/organizations/missing/archive", json={"stopped_on": "2026-10-18"}).status_code == 404
    assert client.post("/api/organizations/missing/restore").status_code == 404
    from app.models.organization import Organization
    assert Organization(**org).status == "active"
    from app.services import organization_service
    protected = next((item for item in organization_service.list_organizations() if item.name in organization_service.PROTECTED_NAMES), None)
    if not protected:
        protected_id = client.post("/api/organizations", json={"name": "无忧茶院"}).json()["id"]
    else:
        protected_id = protected.id
    assert client.post(f"/api/organizations/{protected_id}/archive", json={"stopped_on": "2026-10-18"}).status_code == 409


def test_archived_organization_keeps_original_member_view_scope(monkeypatch):
    from datetime import datetime, timezone
    from types import SimpleNamespace as NS

    from app.models.organization import Organization
    from app.services import organization_service, principal_service

    now = datetime.now(timezone.utc)
    archived = Organization(id="history", name="历史组织", member_ids=["owner"], status="archived", created_at=now, updated_at=now)
    monkeypatch.setattr(organization_service, "_organizations", {"history": archived})
    monkeypatch.setattr(principal_service.customer_service, "list_customers", lambda: [NS(id="owner", nickname="甲", name="")])
    monkeypatch.setattr(principal_service.position_edit_permission_service, "get_permissions", lambda _: {"principal_scope": "own"})
    monkeypatch.setattr(principal_service.account_service, "get_account", lambda _: NS(owner="甲"))
    request = NS(state=NS(user_id="own", user_role="测试"))
    assert principal_service.scope(request)[0] == [archived]
    monkeypatch.setattr(principal_service.account_service, "get_account", lambda _: NS(owner="其他人"))
    assert principal_service.scope(request)[0] == []


def test_archive_and_restore_require_organization_page_permission(client, monkeypatch):
    from app.services import organization_service, position_permission_service
    from app.utils import request_roles

    org = client.post("/api/organizations", json={"name": f"归档权限_{_unique()}"}).json()
    monkeypatch.setattr(request_roles, "get_request_roles", lambda _: ["无组织权限角色"])
    monkeypatch.setattr(position_permission_service, "get_permissions", lambda _: [])
    for action, body in (("archive", {"stopped_on": "2026-10-18"}), ("restore", {})):
        response = client.post(f"/api/organizations/{org['id']}/{action}", json=body)
        assert response.status_code == 403
    assert organization_service.get_organization(org["id"]).status == "active"
