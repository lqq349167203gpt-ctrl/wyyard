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
