import base64
import time
from types import SimpleNamespace as NS

import jwt
import pytest
from app.config.settings import settings
from app.middleware.jwt_auth import create_customer_token
from app.services import activity_checkin_service as service
from fastapi import HTTPException


def signed_code(customer_id="self", activity="class:one", expires=None):
    return service.PREFIX + jwt.encode({"cid": customer_id, "activity": activity,
        "exp": expires if expires is not None else int(time.time()) + 600,
        "iss": "wyyard-checkin", "aud": "activity-checkin"}, settings.jwt_secret, algorithm="HS256")


def test_generated_qr_is_image_and_is_bound_to_one_customer_and_activity(monkeypatch):
    seen = []
    monkeypatch.setattr(service, "_activity", lambda cid, key: seen.append((cid, key)))
    result = service.create_code("self", "class:one")
    assert base64.b64decode(result["image"].split(",")[1]).startswith(b"\x89PNG\r\n\x1a\n")
    assert seen == [("self", "class:one")]
    assert int(time.time()) < result["expires_at"] <= int(time.time()) + 600


@pytest.mark.parametrize("code", ["not-a-code", service.PREFIX + "bad-signature", signed_code(expires=1),
                                      service.PREFIX + create_customer_token("self", "客户")])
def test_invalid_expired_or_login_token_cannot_be_used_as_checkin(code):
    with pytest.raises(HTTPException) as error:
        service._decode(code)
    assert error.value.status_code == 400


@pytest.mark.parametrize("withdrawn,cancelled", [(True, False), (False, True)])
def test_withdrawn_or_cancelled_customer_cannot_generate_code(monkeypatch, withdrawn, cancelled):
    from app.api import customer_detail

    monkeypatch.setattr(service.customer_service, "get_customer", lambda _: NS(is_deleted=False))
    monkeypatch.setattr(customer_detail, "_build_activities", lambda _: [{"activity_key": "class:one", "date": "2026-10-16", "withdrawn": withdrawn}])
    monkeypatch.setattr(service.visit_service, "list_basic_visits", lambda _: [NS(visit_date="2026-10-16", cancelled=cancelled, arrived=False)])
    with pytest.raises(HTTPException) as error:
        service.create_code("self", "class:one")
    assert error.value.status_code == 400


def test_member_code_endpoint_ignores_foreign_customer(client, monkeypatch):
    calls = []
    monkeypatch.setattr(service, "create_code", lambda cid, key: calls.append((cid, key)) or {"image": "image"})
    response = client.get("/api/client/checkin-code?activity_key=class:one&customer_id=other", headers={
        "Authorization": "Bearer " + create_customer_token("self", "会员"),
    })
    assert response.status_code == 200 and calls == [("self", "class:one")]
    forbidden = client.post("/api/activity-checkins/confirm", json={"code": signed_code()}, headers={
        "Authorization": "Bearer " + create_customer_token("self", "会员"),
    })
    assert forbidden.status_code == 403


def test_checkin_permission_is_required_even_for_staff(client, monkeypatch):
    import uuid

    from app.middleware.jwt_auth import create_access_token
    from app.models.account import AccountCreate
    from app.services import account_service

    account = account_service.create_account(AccountCreate(owner="普通账号", role="普通核销测试角色",
        username="no_checkin_" + uuid.uuid4().hex, password="test123456"))
    token = create_access_token(account_id=account.id, username=account.username, owner=account.owner, role=account.role)
    monkeypatch.setattr(service, "inspect_code", lambda *_: pytest.fail("无权限不得读取核销信息"))
    response = client.post("/api/activity-checkins/preview", json={"code": signed_code()}, headers={"Authorization": "Bearer " + token})
    assert response.status_code == 403


def test_checkin_updates_arrival_and_deducts_once_with_readable_log(client, created_customer, monkeypatch):
    from app.services import operation_log_service, storage

    cid = created_customer["id"]
    card = client.post("/api/membership-cards", json={"customer_id": cid,
        "nickname": created_customer["nickname"], "card_type": "次卡", "price": 0,
        "effective_date": "2026-01-01", "duration_type": "month", "duration_value": 120,
        "total_count": 5, "remaining_count": 5})
    assert card.status_code == 200, card.text
    course = client.post("/api/class-records", json={"date": "2026-10-16", "course_id": "test-checkin",
        "course_name": "扫码核销课程", "course_type": "读书会", "participant_ids": [cid],
        "membership_deduction_count": 2})
    assert course.status_code == 200, course.text
    visit = client.post("/api/visits", json={"visit_date": "2026-10-16", "customer_id": cid})
    assert visit.status_code == 200, visit.text
    code = signed_code(cid, f'class:{course.json()["id"]}')
    preview = client.post("/api/activity-checkins/preview", json={"code": code})
    assert preview.status_code == 200, preview.text
    assert preview.json()["nickname"] == created_customer["nickname"]
    first = client.post("/api/activity-checkins/confirm", json={"code": code})
    assert first.status_code == 200, first.text
    assert client.get(f'/api/membership-cards/{card.json()["id"]}').json()["effective_remaining"] == 3
    second = client.post("/api/activity-checkins/confirm", json={"code": code})
    assert second.status_code == 200, second.text
    assert client.get(f'/api/membership-cards/{card.json()["id"]}').json()["effective_remaining"] == 3
    assert service.visit_service.get_visit_without_metrics(visit.json()["id"]).arrived is True
    event_id = f'{cid}:class:{course.json()["id"]}'
    assert storage.load_item(service.FILENAME, event_id)["operator"]
    logs = [row for row in operation_log_service.list_logs(section="活动核销") if row.entity_id == event_id]
    assert len(logs) == 1 and "2026-10-16" in logs[0].content and "扫码核销课程" in logs[0].content
    assert "code" not in (logs[0].after_data or {})
    # 已核销的到店状态被人工撤销后，旧二维码不得再次触发扣卡。
    client.patch(f'/api/visits/{visit.json()["id"]}', json={"arrived": False})
    assert client.post("/api/activity-checkins/confirm", json={"code": code}).status_code == 409
    client.delete(f'/api/class-records/{course.json()["id"]}')
    client.delete(f'/api/membership-cards/{card.json()["id"]}')


def test_locked_visit_cannot_be_changed_by_scanning(client, monkeypatch):
    from app.services import customer_access_service, visit_verification_service

    monkeypatch.setattr(customer_access_service, "require_customer_scope", lambda *_args, **_kwargs: None)
    visit = NS(id="visit", arrived=False)
    info = {"customer_id": "self", "activity_key": "class:one", "checked": False}
    monkeypatch.setattr(service, "inspect_code", lambda *_: (info, visit))
    def locked(*_):
        raise HTTPException(423, "已核对锁定")
    monkeypatch.setattr(visit_verification_service, "ensure_update_allowed", locked)
    monkeypatch.setattr(service.visit_service, "update_visit", lambda *_: pytest.fail("锁定后不得修改到店"))
    response = client.post("/api/activity-checkins/confirm", json={"code": signed_code()})
    assert response.status_code == 423
