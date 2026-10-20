from types import SimpleNamespace as NS

import pytest
from app.api import customer_detail
from app.services import staff_member_service as service
from fastapi import HTTPException


def person(cid="self", name="姓名甲", nickname="昵称甲", phone="13800000001", deleted=False):
    return NS(id=cid, name=name, nickname=nickname, phone=phone, is_deleted=deleted, member_type="体验会员")


@pytest.mark.parametrize("owner", ["姓名甲", "昵称甲"])
def test_resolves_own_customer_only_with_unique_phone(monkeypatch, owner):
    own = person()
    monkeypatch.setattr(service.account_service, "get_account", lambda _: NS(enabled=True, owner=owner))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: [own, person("other", "别人", "别名", "13800000002")])
    assert service.resolve_customer("authenticated-account") is own


@pytest.mark.parametrize("people", [
    [], [person(phone="")], [person(deleted=True)],
    [person(), person("other", "别名", "昵称甲", "13800000002")],
    [person(), person("other", "别人", "另一个昵称", "13800000001")],
])
def test_missing_deleted_or_ambiguous_customer_is_unbound(monkeypatch, people):
    monkeypatch.setattr(service.account_service, "get_account", lambda _: NS(enabled=True, owner="昵称甲"))
    monkeypatch.setattr(service.customer_service, "list_customers", lambda: people)
    monkeypatch.setattr(customer_detail, "_build_purchase_summary", lambda _: pytest.fail("未关联不得读取权益"))
    assert service.read_member_data("account", "cards", 1, 20) == {"bound": False, "message": "该账号未绑定客户信息", "can_manage": True}


@pytest.mark.parametrize("account", [None, NS(enabled=False, owner="昵称甲")])
def test_requires_enabled_backend_account(monkeypatch, account):
    monkeypatch.setattr(service.account_service, "get_account", lambda _: account)
    with pytest.raises(HTTPException) as error:
        service.resolve_customer("account")
    assert error.value.status_code == 403


@pytest.mark.parametrize("section,builder", [("cards", "_build_purchase_summary"), ("transactions", "_build_payment_records"), ("activities", "_build_activities")])
def test_endpoint_ignores_foreign_customer_and_reuses_own_data(client, monkeypatch, section, builder):
    seen = []
    monkeypatch.setattr(service, "resolve_customer", lambda account_id: seen.append(account_id) or person())
    requested = []
    monkeypatch.setattr(customer_detail, builder, lambda customer_id: requested.append(customer_id) or [{"id": str(i)} for i in range(25)])
    response = client.get("/api/accounts/me/member-data", params={"section": section, "page": 2, "customer_id": "foreign", "phone": "13899999999"})
    assert response.status_code == 200
    result = response.json()
    assert requested == ["self"] and seen[0] != "foreign"
    assert result["customer"] == {"nickname": "昵称甲", "member_type": "体验会员", "card_status": "", "card_status_tone": "neutral"}
    assert "phone" not in result["customer"]
    assert len(result["items"]) == (25 if section == "cards" else 5)


def test_customer_token_cannot_enter_staff_member_view(client):
    from app.middleware.jwt_auth import create_customer_token

    token = create_customer_token(customer_id="self", nickname="昵称甲")
    response = client.get("/api/accounts/me/member-data", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_home_reuses_card_balance_and_returns_bounded_activity_preview(client, monkeypatch):
    from app.services import visit_service

    monkeypatch.setattr(service, "resolve_customer", lambda _: person())
    purchases = [{"type": "会员卡", "current_remaining": "不限", "remaining": 99}]
    monkeypatch.setattr(customer_detail, "_build_purchase_summary", lambda _: purchases)
    monkeypatch.setattr(customer_detail, "_build_activities", lambda _: [{"id": str(i)} for i in range(25)])
    monkeypatch.setattr(visit_service, "count_customer_visits", lambda _: 12)
    response = client.get("/api/accounts/me/member-data", params={"section": "home"})
    assert response.status_code == 200
    result = response.json()
    assert result["stats"] == {"visit_count": 12, "activity_count": 25, "remaining": "不限"}
    assert result["purchase_summary"] == purchases
    assert len(result["items"]) == 7
    assert result["total"] == 25


@pytest.mark.parametrize("has_manager", [False, True])
def test_phone_entry_prioritizes_management_and_remembers_verified_customer(client, monkeypatch, has_manager):
    from app.api import wechat

    own = person()
    manager = NS(id="manager") if has_manager else None
    session = NS(account_id="old-account", customer_id="old-customer")
    phone_calls = []
    monkeypatch.setattr(wechat.wechat_service, "get_phone_number", lambda code, **kw: phone_calls.append((code, kw)) or own.phone)
    monkeypatch.setattr(wechat.wechat_service, "jscode2session", lambda _: {"openid": "wx-self"})
    monkeypatch.setattr(wechat.wechat_service, "find_session_by_openid", lambda _: session)
    saved = []
    monkeypatch.setattr(wechat.wechat_service, "save_session", saved.append)
    monkeypatch.setattr(service, "customer_for_phone", lambda _: own)
    monkeypatch.setattr(service, "management_account_for", lambda _: manager)
    monkeypatch.setattr(wechat, "_build_login_response", lambda _: {"account": {"id": "manager"}})
    monkeypatch.setattr(wechat, "_make_jwt_token", lambda *_: "management-token")
    result = client.post("/api/wechat/entry-login", json={"code": "phone-code", "login_code": "login-code"})
    assert result.status_code == 200
    body = result.json()
    assert phone_calls == [("phone-code", {"management": True})]
    assert session.customer_id == "self" and saved == [session]
    if has_manager:
        assert body["account"]["id"] == "manager" and session.account_id == "manager"
    else:
        from app.middleware.jwt_auth import decode_token

        assert body["role"] == "customer" and session.account_id == ""
        assert decode_token(body["token"])["customer_id"] == "self"


def test_phone_entry_does_not_create_unregistered_customer(client, monkeypatch):
    from app.api import wechat

    monkeypatch.setattr(wechat.wechat_service, "get_phone_number", lambda *_, **__: "13800000000")
    monkeypatch.setattr(wechat.wechat_service, "jscode2session", lambda _: {"openid": "wx-self"})
    monkeypatch.setattr(service, "customer_for_phone", lambda _: None)
    monkeypatch.setattr(wechat.wechat_service, "create_session", lambda *_: pytest.fail("未关联不得创建登录绑定"))
    response = client.post("/api/wechat/entry-login", json={"code": "phone-code", "login_code": "login-code"})
    assert response.status_code == 403 and response.json()["detail"] == service.UNBOUND_MESSAGE


@pytest.mark.parametrize("has_manager", [False, True])
def test_member_read_uses_own_token_and_reports_switch_capability(client, monkeypatch, has_manager):
    from app.middleware.jwt_auth import create_customer_token

    own = person()
    monkeypatch.setattr(service.customer_service, "get_customer", lambda cid: own if cid == "self" else None)
    monkeypatch.setattr(service, "customer_for_phone", lambda _: own)
    monkeypatch.setattr(service, "management_account_for", lambda _: NS(id="manager") if has_manager else None)
    requested = []
    monkeypatch.setattr(customer_detail, "_build_purchase_summary", lambda cid: requested.append(cid) or [])
    response = client.get("/api/client/member-data?section=cards&customer_id=foreign", headers={
        "Authorization": "Bearer " + create_customer_token("self", "昵称甲"),
    })
    assert response.status_code == 200 and requested == ["self"]
    assert response.json()["can_manage"] is has_manager


@pytest.mark.parametrize("has_manager", [False, True])
def test_switch_to_management_checks_current_customer_and_live_account(client, monkeypatch, has_manager):
    from app.api import client as client_api
    from app.api import wechat
    from app.middleware.jwt_auth import create_customer_token

    own = person()
    monkeypatch.setattr(client_api, "get_customer", lambda _: own)
    monkeypatch.setattr(service, "management_account_for", lambda _: NS(id="manager") if has_manager else None)
    monkeypatch.setattr(wechat, "_build_login_response", lambda _: {"account": {"id": "manager"}})
    monkeypatch.setattr(wechat, "_make_jwt_token", lambda *_: "management-token")
    response = client.post("/api/client/management-login", headers={
        "Authorization": "Bearer " + create_customer_token("self", "昵称甲"),
    })
    assert response.status_code == (200 if has_manager else 403)
    if has_manager:
        assert response.json()["token"] == "management-token"


@pytest.mark.parametrize("member_only", [False, True])
def test_wechat_session_prefers_management_on_login_but_keeps_member_mode_during_renewal(client, monkeypatch, member_only):
    from app.api import wechat

    own = person()
    manager = NS(id="manager", enabled=True)
    monkeypatch.setattr(wechat.wechat_service, "jscode2session", lambda _: {"openid": "wx-self"})
    monkeypatch.setattr(wechat.wechat_service, "find_session_by_openid", lambda _: NS(account_id="manager", customer_id="self"))
    monkeypatch.setattr(service.customer_service, "get_customer", lambda _: own)
    monkeypatch.setattr(service.account_service, "get_account", lambda _: manager)
    monkeypatch.setattr(service, "customer_for_phone", lambda _: own)
    monkeypatch.setattr(wechat, "_build_login_response", lambda _: {"account": {"id": "manager"}})
    monkeypatch.setattr(wechat, "_make_jwt_token", lambda *_: "management-token")
    response = client.post("/api/wechat/login", json={"code": "wx-code", "member_only": member_only})
    assert response.status_code == 200
    if member_only:
        assert response.json()["role"] == "customer"
    else:
        assert response.json()["account"]["id"] == "manager"


def test_management_link_requires_one_active_account_and_reverse_customer_match(monkeypatch):
    own = person()
    account = NS(id="a", owner=own.nickname, enabled=True, is_deleted=False)
    disabled = NS(id="disabled", owner=own.nickname, enabled=False, is_deleted=False)
    monkeypatch.setattr(service.account_service, "list_accounts", lambda: [account, disabled])
    monkeypatch.setattr(service, "resolve_customer", lambda _: own)
    assert service.management_account_for(own) is account
    monkeypatch.setattr(service.account_service, "list_accounts", lambda: [account, account])
    assert service.management_account_for(own) is None
    monkeypatch.setattr(service.account_service, "list_accounts", lambda: [account])
    monkeypatch.setattr(service, "resolve_customer", lambda _: person("other"))
    assert service.management_account_for(own) is None
