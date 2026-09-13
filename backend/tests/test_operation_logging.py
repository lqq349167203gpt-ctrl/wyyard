"""操作日志内容与记录规则"""
import uuid
from types import SimpleNamespace


def _unique():
    return uuid.uuid4().hex[:12]


def test_role_changes_use_role_wording():
    from app.middleware.operation_logging import build_log_content

    assert build_log_content("POST", "/api/positions", {"name": "主理人"}) == "新增角色 主理人"
    assert build_log_content("DELETE", "/api/positions/abc", {}, {"name": "主理人"}) == "删除角色 主理人"
    assert build_log_content("PUT", "/api/positions/reorder", {"ids": ["a", "b"]}) == "调整角色排序"


def test_save_without_changes_writes_no_content():
    from app.middleware.operation_logging import build_log_content

    before = {"owner": "二雅", "role": "课程老师", "enabled": True}
    assert build_log_content("PATCH", "/api/accounts/acc-1", dict(before), before) == ""


def test_bind_wechat_logs_only_new_binding(client, monkeypatch):
    from app.api import accounts as accounts_api
    from app.services import operation_log_service

    username = f"user_{_unique()}"
    password = f"pw{_unique()}9"
    created = client.post("/api/accounts", json={
        "owner": f"owner_{username}", "role": "管理员",
        "username": username, "password": password, "enabled": True,
    }).json()

    login = client.post("/api/accounts/login", json={"username": username, "password": password}).json()
    headers = {"Authorization": f"Bearer {login['token']}"}

    monkeypatch.setattr(accounts_api.wechat_service, "jscode2session", lambda _code: {"openid": "openid-test"})
    monkeypatch.setattr(accounts_api.wechat_service, "create_session", lambda _openid, _account_id: None)

    # 首次绑定：记录「绑定微信」
    monkeypatch.setattr(accounts_api.wechat_service, "find_session_by_openid", lambda _openid: None)
    assert client.post("/api/accounts/bind-wechat", json={"code": "c1"}, headers=headers).status_code == 200
    contents = [log.content for log in operation_log_service.list_logs(section="账号管理")]
    assert "绑定微信" in contents

    # 已经绑定过：没有变更，不再写日志
    monkeypatch.setattr(
        accounts_api.wechat_service,
        "find_session_by_openid",
        lambda _openid: SimpleNamespace(account_id=created["id"]),
    )
    before_count = len(operation_log_service.list_logs(section="账号管理"))
    assert client.post("/api/accounts/bind-wechat", json={"code": "c1"}, headers=headers).status_code == 200
    assert len(operation_log_service.list_logs(section="账号管理")) == before_count

    client.delete(f"/api/accounts/{created['id']}")
