"""客户手机号、微信号的角色权限、脱敏和审计。"""

import json
import uuid

from app.services import customer_chat as customer_chat_service


def _permission_payload(*, phone=None, wechat=None):
    disabled = {"view": False, "copy": False, "edit": False}
    return {
        "visits": "own",
        "activities": "own",
        "contacts": {
            "phone": phone or disabled,
            "wechat": wechat or disabled,
        },
    }


def test_customer_contacts_are_masked_and_each_action_is_authorized_and_logged(client):
    suffix = uuid.uuid4().hex[:10]
    role_name = f"联系方式测试_{suffix}"
    password = f"pw{suffix}9"
    raw_phone = f"138{str(int(suffix[:6], 16))[-8:].zfill(8)}"
    raw_wechat = f"wx_contact_{suffix}"

    position = client.post("/api/positions", json={"name": role_name}).json()
    customer = client.post("/api/customers", json={
        "nickname": f"联系方式客户_{suffix}",
        "phone": raw_phone,
        "wechat": raw_wechat,
    }).json()
    account = None
    created_by_role = None
    try:
        response = client.put("/api/position-permissions/full", json={
            "position": role_name,
            "pages": ["healing-records"],
            "edit_permissions": _permission_payload(),
        })
        assert response.status_code == 200
        account_response = client.post("/api/accounts", json={
            "owner": f"联系方式员工_{suffix}",
            "role": role_name,
            "username": f"contact_{suffix}",
            "password": password,
            "enabled": True,
        })
        assert account_response.status_code == 200
        account = account_response.json()
        login = client.post("/api/accounts/login", json={
            "username": account["username"],
            "password": password,
        })
        headers = {"Authorization": f"Bearer {login.json()['token']}"}

        detail = client.get(f"/api/customers/{customer['id']}", headers=headers)
        assert detail.status_code == 200
        assert detail.json()["phone"] == f"{raw_phone[:3]}****{raw_phone[-4:]}"
        assert "****" in detail.json()["wechat"]
        aggregate = client.get(f"/api/customer-detail/{customer['id']}", headers=headers)
        assert "****" in aggregate.json()["customer"]["phone"]

        # AI 查询和修改入口也不能绕过角色权限。
        customer_chat_service._ctx_var.set({"operator": account["owner"], "role": role_name})
        ai_query = json.loads(customer_chat_service.query_customer_info.invoke({
            "customer_name": customer["nickname"],
        }))
        assert ai_query["info"]["电话"] != raw_phone
        assert "****" in ai_query["info"]["电话"]
        ai_update = json.loads(customer_chat_service.update_customer_fields.invoke({
            "customer_name": customer["nickname"],
            "phone": "13900139001",
        }))
        assert ai_update["reason"] == "forbidden_contact_edit"

        assert client.post(
            f"/api/customers/{customer['id']}/contact-access",
            json={"field": "phone", "action": "view"},
            headers=headers,
        ).status_code == 403
        assert client.patch(
            f"/api/customers/{customer['id']}",
            json={"phone": "13900139001"},
            headers=headers,
        ).status_code == 403

        # 第一次新建客户不受联系方式修改权限限制。
        created_response = client.post("/api/customers", json={
            "nickname": f"首次录入_{suffix}",
            "phone": "13700137001",
            "wechat": f"first_{suffix}",
        }, headers=headers)
        assert created_response.status_code == 200
        created_by_role = created_response.json()

        response = client.put("/api/position-permissions/full", json={
            "position": role_name,
            "pages": ["healing-records"],
            "edit_permissions": _permission_payload(
                phone={"view": True, "copy": False, "edit": True},
                wechat={"view": False, "copy": True, "edit": False},
            ),
        })
        assert response.status_code == 200

        viewed = client.post(
            f"/api/customers/{customer['id']}/contact-access",
            json={"field": "phone", "action": "view"},
            headers=headers,
        )
        assert viewed.status_code == 200
        assert viewed.json()["value"] == raw_phone
        copied = client.post(
            f"/api/customers/{customer['id']}/contact-access",
            json={"field": "wechat", "action": "copy"},
            headers=headers,
        )
        assert copied.status_code == 200
        assert copied.json()["value"] == raw_wechat

        updated = client.patch(
            f"/api/customers/{customer['id']}",
            json={"phone": "13900139001"},
            headers=headers,
        )
        assert updated.status_code == 200
        assert client.patch(
            f"/api/customers/{customer['id']}",
            json={"wechat": "not_allowed"},
            headers=headers,
        ).status_code == 403

        logs = client.get("/api/operation-logs", params={"entity_id": customer["id"]}).json()
        assert any(log["method"] == "VIEW" and "查看" in log["content"] and "手机号" in log["content"] for log in logs)
        assert any(log["method"] == "COPY" and "复制" in log["content"] and "微信号" in log["content"] for log in logs)
        assert any(log["method"] == "PATCH" and "修改" in log["content"] and "手机号" in log["content"] for log in logs)
    finally:
        if created_by_role:
            client.delete(f"/api/customers/{created_by_role['id']}")
        client.delete(f"/api/customers/{customer['id']}")
        if account:
            client.delete(f"/api/accounts/{account['id']}")
        client.delete(f"/api/positions/{position['id']}")
