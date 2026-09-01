import uuid


def _name(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:6]}"


def test_follow_up_status_description_is_required(client):
    response = client.post("/api/follow-up-statuses", json={"name": _name("待联系"), "description": ""})
    assert response.status_code == 422


def test_unconfigured_is_not_a_configurable_status(client):
    response = client.get("/api/follow-up-statuses?include_disabled=true")
    assert response.status_code == 200
    assert "未配置" not in {item["name"] for item in response.json()}

    create_response = client.post(
        "/api/follow-up-statuses",
        json={"name": "未配置", "description": "不应允许创建"},
    )
    assert create_response.status_code == 409


def test_configured_status_can_be_used_and_renamed(client):
    original_name = _name("重点跟进")
    created = client.post(
        "/api/follow-up-statuses",
        json={"name": original_name, "description": "需要优先联系的客户"},
    )
    assert created.status_code == 200
    status = created.json()

    customer = client.post(
        "/api/customers",
        json={"nickname": _name("配置状态客户"), "follow_up_status": original_name},
    )
    assert customer.status_code == 200

    renamed = _name("本周跟进")
    updated = client.put(
        f"/api/follow-up-statuses/{status['id']}",
        json={"name": renamed, "description": "本周内需要完成联系的客户"},
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "本周内需要完成联系的客户"

    refreshed = client.get(f"/api/customers/{customer.json()['id']}")
    assert refreshed.status_code == 200
    assert refreshed.json()["follow_up_status"] == renamed
    client.delete(f"/api/customers/{customer.json()['id']}")


def test_status_in_use_cannot_be_disabled(client):
    name = _name("使用中")
    status = client.post(
        "/api/follow-up-statuses",
        json={"name": name, "description": "用于验证停用保护"},
    ).json()
    customer = client.post(
        "/api/customers",
        json={"nickname": _name("停用保护客户"), "follow_up_status": name},
    ).json()

    response = client.put(f"/api/follow-up-statuses/{status['id']}", json={"enabled": False})
    assert response.status_code == 409
    assert "仍有 1 位客户使用" in response.json()["detail"]
    client.delete(f"/api/customers/{customer['id']}")
