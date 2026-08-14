"""账号 API 测试"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.services import position_permission_service


def _unique(suffix=""):
    return f"{uuid.uuid4().hex[:12]}{suffix}"


def _password(u):
    """符合密码策略（≥8 位且必须含字母+数字）的测试密码"""
    return f"pw{u}9"


def _login(client, username, password):
    return client.post("/api/accounts/login", json={
        "username": username, "password": password,
    })


@pytest.fixture
def make_account(client):
    """创建测试账号（唯一后缀），用例结束后统一清理，避免污染共用库"""
    created_ids = []

    def _create(password=None):
        u = _unique()
        pwd = password or _password(u)
        resp = client.post("/api/accounts", json={
            "owner": f"owner_{u}", "role": "管理员",
            "username": f"user_{u}", "password": pwd, "enabled": True,
        })
        assert resp.status_code == 200, resp.text
        account = resp.json()
        created_ids.append(account["id"])
        return account, u, pwd

    yield _create
    for aid in created_ids:
        # 用例自身可能已删除（404 忽略）
        client.delete(f"/api/accounts/{aid}")


class TestAccountCRUD:
    """账号增删改查"""

    def test_list_accounts(self, client):
        resp = client.get("/api/accounts")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_account(self, client, make_account):
        account, u, _ = make_account()
        assert account["id"] is not None

    def test_create_duplicate_account(self, client, make_account):
        """重复用户名应报错"""
        account, u, pwd = make_account()
        resp = client.post("/api/accounts", json={
            "owner": f"owner_{u}", "role": "管理员",
            "username": f"user_{u}", "password": pwd, "enabled": True,
        })
        assert resp.status_code == 400

    def test_create_account_weak_password(self, client):
        """密码策略：过短或缺少字母/数字应报 400"""
        u = _unique()
        for bad in ("123", "onlyletters", "12345678"):
            resp = client.post("/api/accounts", json={
                "owner": f"weak_{u}", "role": "管理员",
                "username": f"weak_{u}", "password": bad, "enabled": True,
            })
            assert resp.status_code == 400

    def test_update_account(self, client, make_account):
        account, u, _ = make_account()
        resp = client.patch(f"/api/accounts/{account['id']}", json={"owner": f"new_{u}"})
        assert resp.status_code == 200

    def test_update_account_not_found(self, client):
        resp = client.patch("/api/accounts/nonexistent-id", json={"owner": "x"})
        assert resp.status_code == 404

    def test_delete_account(self, client, make_account):
        account, _, _ = make_account()
        resp = client.delete(f"/api/accounts/{account['id']}")
        assert resp.status_code == 200

    def test_delete_account_not_found(self, client):
        resp = client.delete("/api/accounts/nonexistent-id")
        assert resp.status_code == 404

    def test_account_manager_can_load_and_manage_regular_accounts_but_not_superadmins(self, client, make_account):
        previous_permissions = position_permission_service.get_permissions("管理员")
        manager, u, manager_password = make_account()
        created_account_id = ""
        try:
            position_permission_service.set_permissions(
                "管理员",
                sorted(set(previous_permissions) | {"position-management"}),
            )
            login_resp = _login(client, f"user_{u}", manager_password)
            manager_headers = {"Authorization": f"Bearer {login_resp.json()['token']}"}

            list_resp = client.get("/api/accounts", headers=manager_headers)
            assert list_resp.status_code == 200
            assert any(account["id"] == manager["id"] for account in list_resp.json())

            regular_u = _unique()
            create_resp = client.post("/api/accounts", json={
                "owner": f"manager_owner_{regular_u}",
                "role": "管理员",
                "username": f"manager_user_{regular_u}",
                "password": _password(regular_u),
                "enabled": True,
            }, headers=manager_headers)
            assert create_resp.status_code == 200
            created_account_id = create_resp.json()["id"]

            forbidden_resp = client.post("/api/accounts", json={
                "owner": f"super_owner_{regular_u}",
                "role": "超级管理员",
                "username": f"super_user_{regular_u}",
                "password": _password(regular_u),
                "enabled": True,
            }, headers=manager_headers)
            assert forbidden_resp.status_code == 403

            system_account = next(account for account in list_resp.json() if account["role"] == "超级管理员")
            update_resp = client.patch(
                f"/api/accounts/{system_account['id']}",
                json={"enabled": False},
                headers=manager_headers,
            )
            assert update_resp.status_code == 403
        finally:
            position_permission_service.set_permissions("管理员", previous_permissions)
            if created_account_id:
                client.delete(f"/api/accounts/{created_account_id}")


class TestLogin:
    """登录"""

    def test_login_success(self, client, make_account):
        account, u, pwd = make_account()
        resp = _login(client, f"user_{u}", pwd)
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert "permissions" in resp.json()

    def test_login_wrong_password(self, client, make_account):
        account, u, _ = make_account()
        resp = _login(client, f"user_{u}", f"wrong{u}9")
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_login_nonexistent_user(self, client):
        resp = _login(client, f"nobody_{_unique()}", "nopass123")
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_same_browser_login_replaces_previous_session(self, client, make_account):
        from app.middleware.jwt_auth import decode_token

        _, u, password = make_account()
        headers = {"X-Device-ID": f"pc-test-{u}", "X-Client-Type": "pc"}
        first = client.post(
            "/api/accounts/login",
            json={"username": f"user_{u}", "password": password},
            headers=headers,
        )
        second = client.post(
            "/api/accounts/login",
            json={"username": f"user_{u}", "password": password},
            headers=headers,
        )
        first_jti = decode_token(first.json()["token"])["jti"]
        second_jti = decode_token(second.json()["token"])["jti"]
        auth_headers = {"Authorization": f"Bearer {second.json()['token']}"}
        sessions = client.get("/api/accounts/sessions", headers=auth_headers)

        assert sessions.status_code == 200
        assert [item["id"] for item in sessions.json()] == [second_jti]
        assert first_jti != second_jti
        replaced = client.get(
            "/api/accounts/sessions",
            headers={"Authorization": f"Bearer {first.json()['token']}"},
        )
        assert replaced.status_code == 401

    def test_session_list_prunes_expired_and_merges_legacy_duplicates(self, make_account):
        from app.config.settings import settings
        from app.services import session_service
        from app.services.storage import load_item, save_item

        account, u, _ = make_account()
        old_id = f"expired-{u}"
        old_time = datetime.now(timezone.utc) - timedelta(hours=settings.jwt_expire_hours + 1)
        save_item("sessions.json", old_id, {
            "id": old_id,
            "account_id": account["id"],
            "device_info": "Mac OS legacy",
            "ip": "203.0.113.8",
            "login_time": old_time.isoformat(),
            "last_active": old_time.isoformat(),
        })
        first_legacy_id = f"legacy-first-{u}"
        latest_legacy_id = f"legacy-latest-{u}"
        session_service.create_session(first_legacy_id, account["id"], "Mac OS", "203.0.113.9")
        session_service.create_session(latest_legacy_id, account["id"], "Mac OS", "203.0.113.9")

        sessions = session_service.list_account_sessions(account["id"], current_session_id=latest_legacy_id)

        assert [item["id"] for item in sessions] == [latest_legacy_id]
        assert load_item("sessions.json", old_id) is None
        assert load_item("sessions.json", first_legacy_id) is None


class TestPasswordChange:
    """密码修改（自助改密，仅本人可操作）"""

    def _self_headers(self, client, username, password):
        """以目标账号本人身份登录，返回其 Authorization header"""
        resp = _login(client, username, password)
        assert resp.json()["success"] is True
        return {"Authorization": f"Bearer {resp.json()['token']}"}

    def test_change_password(self, client, make_account):
        account, u, old_pwd = make_account()
        new_pwd = f"new{u}9"
        headers = self._self_headers(client, f"user_{u}", old_pwd)
        resp = client.post(f"/api/accounts/{account['id']}/change-password", json={
            "old_password": old_pwd, "new_password": new_pwd,
        }, headers=headers)
        assert resp.status_code == 200
        resp = _login(client, f"user_{u}", new_pwd)
        assert resp.json()["success"] is True

    def test_change_password_wrong_old(self, client, make_account):
        account, u, pwd = make_account()
        headers = self._self_headers(client, f"user_{u}", pwd)
        resp = client.post(f"/api/accounts/{account['id']}/change-password", json={
            "old_password": f"wrong{u}9", "new_password": f"new{u}9",
        }, headers=headers)
        assert resp.status_code == 400

    def test_change_password_nonexistent_not_found(self, client):
        """自助改密先查账号存在性：不存在的账号返回 404"""
        resp = client.post("/api/accounts/nonexistent/change-password", json={
            "old_password": "x1234567", "new_password": "y1234567",
        })
        assert resp.status_code == 404

    def test_change_password_other_account_forbidden(self, client, make_account):
        """账号存在但非本人（当前登录为管理员）时返回 403"""
        account, _, _ = make_account()
        resp = client.post(f"/api/accounts/{account['id']}/change-password", json={
            "old_password": "x1234567", "new_password": "y1234567",
        })
        assert resp.status_code == 403


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
