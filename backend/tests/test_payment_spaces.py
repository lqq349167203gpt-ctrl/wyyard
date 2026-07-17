"""付费项目 + 疗愈空间 API 测试"""
import pytest
import uuid


def _u():
    return uuid.uuid4().hex[:8]


@pytest.fixture
def created_space(client):
    """创建唯一名称的测试空间，用后连同其房间一起清理（空间有活动房间时禁止删除）"""
    resp = client.post("/api/spaces", json={"name": f"测试空间_{_u()}"})
    assert resp.status_code == 200
    space = resp.json()
    yield space
    # 清理：先删本空间下的房间，再删空间（只动自己创建的数据）
    spaces = client.get("/api/spaces").json()
    mine = next((s for s in spaces if s["id"] == space["id"]), None)
    if mine:
        for room in mine.get("rooms", []):
            client.delete(f"/api/spaces/{space['id']}/rooms/{room['id']}")
        client.delete(f"/api/spaces/{space['id']}")


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
        assert resp.status_code == 400  # 次数字段由流水派生，禁止直接 PATCH

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
        # 空间名称全局唯一（重名 400），用唯一后缀避免与残留/并发数据冲突
        name = f"测试空间_{_u()}"
        resp = client.post("/api/spaces", json={"name": name})
        assert resp.status_code == 200
        assert resp.json()["name"] == name
        assert resp.json()["id"] is not None
        client.delete(f"/api/spaces/{resp.json()['id']}")  # 用完清理

    def test_update(self, client, created_space):
        sid = created_space["id"]
        new_name = f"已更新空间_{_u()}"
        resp = client.patch(f"/api/spaces/{sid}", json={"name": new_name})
        assert resp.status_code == 200
        assert resp.json()["name"] == new_name

    def test_delete(self, client):
        resp = client.post("/api/spaces", json={"name": f"待删除空间_{_u()}"})
        sid = resp.json()["id"]
        resp = client.delete(f"/api/spaces/{sid}")
        assert resp.status_code == 200

    def test_add_room(self, client, created_space):
        # 房间名称全局唯一（跨空间，重名 400），用唯一后缀
        room_name = f"A101_{_u()}"
        resp = client.post(f"/api/spaces/{created_space['id']}/rooms", json={"name": room_name})
        assert resp.status_code == 200
        assert resp.json()["name"] == room_name

    def test_delete_room(self, client, created_space):
        sid = created_space["id"]
        resp = client.post(f"/api/spaces/{sid}/rooms", json={"name": f"B201_{_u()}"})
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/spaces/{sid}/rooms/{rid}")
        assert resp.status_code == 200
