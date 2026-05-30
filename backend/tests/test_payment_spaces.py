"""付费项目 + 疗愈空间 API 测试"""
import pytest


# ===== 会员卡 (Membership Cards) =====

class TestMembershipCards:
    def test_list(self, client):
        resp = client.get("/api/membership-cards")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client, created_customer):
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-27",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["card_type"] == "体验会员"
        assert data["price"] == 399.0
        assert data["id"] is not None

    def test_create_with_remaining_count(self, client, created_customer):
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "常规通卡",
            "price": 3999.0,
            "effective_date": "2026-05-27",
            "remaining_count": 10,
        })
        assert resp.status_code == 200
        assert resp.json()["remaining_count"] == 10

    def test_update(self, client, created_customer):
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-27",
        })
        cid = resp.json()["id"]
        resp = client.patch(f"/api/membership-cards/{cid}", json={"remaining_count": 5})
        assert resp.status_code == 200
        assert resp.json()["remaining_count"] == 5

    def test_delete(self, client, created_customer):
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-27",
        })
        cid = resp.json()["id"]
        resp = client.delete(f"/api/membership-cards/{cid}")
        assert resp.status_code == 200

    def test_search_customers(self, client):
        resp = client.get("/api/membership-cards/search-customers?q=test")
        assert resp.status_code == 200

    def test_card_types(self, client, created_customer):
        """验证所有卡类型都能创建"""
        for card_type in ["体验会员", "常规通卡", "半年卡", "年卡"]:
            resp = client.post("/api/membership-cards", json={
                "customer_id": created_customer["id"],
                "nickname": created_customer["nickname"],
                "card_type": card_type,
                "price": 100.0,
                "effective_date": "2026-05-27",
            })
            assert resp.status_code == 200, f"创建 {card_type} 失败"


# ===== 会员身份 (Member Identities) =====

class TestMemberIdentities:
    def test_list(self, client):
        resp = client.get("/api/member-identities")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/member-identities", json={"name": "测试身份"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试身份"
        assert resp.json()["id"] is not None

    def test_update(self, client):
        resp = client.post("/api/member-identities", json={"name": "待更新身份"})
        mid = resp.json()["id"]
        resp = client.put(f"/api/member-identities/{mid}", json={"name": "已更新身份"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/member-identities", json={"name": "待删除身份"})
        mid = resp.json()["id"]
        resp = client.delete(f"/api/member-identities/{mid}")
        assert resp.status_code == 200


# ===== 疗愈空间 (Spaces) =====

class TestSpaces:
    def test_list(self, client):
        resp = client.get("/api/spaces")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/spaces", json={"name": "测试空间"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试空间"
        assert resp.json()["id"] is not None

    def test_update(self, client):
        resp = client.post("/api/spaces", json={"name": "待更新空间"})
        sid = resp.json()["id"]
        resp = client.patch(f"/api/spaces/{sid}", json={"name": "已更新空间"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "已更新空间"

    def test_delete(self, client):
        resp = client.post("/api/spaces", json={"name": "待删除空间"})
        sid = resp.json()["id"]
        resp = client.delete(f"/api/spaces/{sid}")
        assert resp.status_code == 200

    def test_add_room(self, client):
        resp = client.post("/api/spaces", json={"name": "房间测试空间"})
        assert resp.status_code == 200
        sid = resp.json()["id"]
        resp = client.post(f"/api/spaces/{sid}/rooms", json={"name": "A101"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "A101"

    def test_delete_room(self, client):
        resp = client.post("/api/spaces", json={"name": "删房间测试空间"})
        sid = resp.json()["id"]
        resp = client.post(f"/api/spaces/{sid}/rooms", json={"name": "B201"})
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/spaces/{sid}/rooms/{rid}")
        assert resp.status_code == 200
