"""账号 API 测试"""
import pytest
import uuid


def _unique(suffix=""):
    return f"{uuid.uuid4().hex[:8]}{suffix}"


class TestAccountCRUD:
    """账号增删改查"""

    def test_list_accounts(self, client):
        resp = client.get("/api/accounts")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_account(self, client):
        u = _unique()
        resp = client.post("/api/accounts", json={
            "owner": f"owner_{u}", "role": "管理员",
            "username": f"user_{u}", "password": "123", "enabled": True,
        })
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

    def test_create_duplicate_account(self, client):
        """重复用户名应报错"""
        u = _unique()
        data = {"owner": f"dup_{u}", "role": "管理员", "username": f"dup_{u}", "password": "123", "enabled": True}
        client.post("/api/accounts", json=data)
        resp = client.post("/api/accounts", json=data)
        assert resp.status_code == 400

    def test_update_account(self, client):
        u = _unique()
        resp = client.post("/api/accounts", json={
            "owner": f"upd_{u}", "role": "管理员",
            "username": f"upd_{u}", "password": "123", "enabled": True,
        })
        aid = resp.json()["id"]
        resp = client.patch(f"/api/accounts/{aid}", json={"owner": f"new_{u}"})
        assert resp.status_code == 200

    def test_update_account_not_found(self, client):
        resp = client.patch("/api/accounts/nonexistent-id", json={"owner": "x"})
        assert resp.status_code == 404

    def test_delete_account(self, client):
        u = _unique()
        resp = client.post("/api/accounts", json={
            "owner": f"del_{u}", "role": "管理员",
            "username": f"del_{u}", "password": "123", "enabled": True,
        })
        aid = resp.json()["id"]
        resp = client.delete(f"/api/accounts/{aid}")
        assert resp.status_code == 200

    def test_delete_account_not_found(self, client):
        resp = client.delete("/api/accounts/nonexistent-id")
        assert resp.status_code == 404


class TestLogin:
    """登录"""

    def test_login_success(self, client):
        u = _unique()
        client.post("/api/accounts", json={
            "owner": f"login_{u}", "role": "管理员",
            "username": f"login_{u}", "password": "loginpass", "enabled": True,
        })
        resp = client.post("/api/accounts/login", json={
            "username": f"login_{u}", "password": "loginpass",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert "permissions" in resp.json()

    def test_login_wrong_password(self, client):
        u = _unique()
        client.post("/api/accounts", json={
            "owner": f"loginerr_{u}", "role": "管理员",
            "username": f"loginerr_{u}", "password": "correctpass", "enabled": True,
        })
        resp = client.post("/api/accounts/login", json={
            "username": f"loginerr_{u}", "password": "wrong_password",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/accounts/login", json={
            "username": f"nobody_{_unique()}", "password": "nopass",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is False


class TestPasswordChange:
    """密码修改"""

    def test_change_password(self, client):
        u = _unique()
        resp = client.post("/api/accounts", json={
            "owner": f"pwd_{u}", "role": "管理员",
            "username": f"pwd_{u}", "password": "oldpass", "enabled": True,
        })
        aid = resp.json()["id"]
        resp = client.post(f"/api/accounts/{aid}/change-password", json={
            "old_password": "oldpass", "new_password": "newpass123",
        })
        assert resp.status_code == 200
        resp = client.post("/api/accounts/login", json={
            "username": f"pwd_{u}", "password": "newpass123",
        })
        assert resp.json()["success"] is True

    def test_change_password_wrong_old(self, client):
        u = _unique()
        resp = client.post("/api/accounts", json={
            "owner": f"pwderr_{u}", "role": "管理员",
            "username": f"pwderr_{u}", "password": "correctpass", "enabled": True,
        })
        aid = resp.json()["id"]
        resp = client.post(f"/api/accounts/{aid}/change-password", json={
            "old_password": "wrong_old", "new_password": "newpass123",
        })
        assert resp.status_code == 400

    def test_change_password_account_not_found(self, client):
        resp = client.post("/api/accounts/nonexistent/change-password", json={
            "old_password": "x", "new_password": "y",
        })
        assert resp.status_code == 404


class TestRoles:
    """角色管理"""

    def test_list_roles(self, client):
        resp = client.get("/api/accounts/roles")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_role(self, client):
        resp = client.post("/api/accounts/roles", json={
            "name": "测试角色",
            "permissions": ["healing-records", "class-records"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "测试角色"
        assert "healing-records" in data["permissions"]
