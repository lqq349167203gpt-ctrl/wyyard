"""客户 API 测试"""
import pytest


class TestCustomerCRUD:
    """客户增删改查"""

    def test_list_customers(self, client):
        resp = client.get("/api/customers")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_customer(self, client, sample_customer):
        resp = client.post("/api/customers", json=sample_customer)
        assert resp.status_code == 200
        data = resp.json()
        assert data["nickname"] == "测试客户A"
        assert data["name"] == "张三"
        assert data["traffic_source"] == "小红书"
        assert data["id"] is not None
        assert data["created_at"] is not None

    def test_get_customer(self, client, created_customer):
        resp = client.get(f"/api/customers/{created_customer['id']}")
        assert resp.status_code == 200
        assert resp.json()["nickname"] == "测试客户A"

    def test_get_customer_not_found(self, client):
        resp = client.get("/api/customers/nonexistent-id")
        assert resp.status_code == 404

    def test_update_customer(self, client, created_customer):
        cid = created_customer["id"]
        resp = client.patch(f"/api/customers/{cid}", json={"nickname": "新昵称", "phone": "13900139000"})
        assert resp.status_code == 200
        assert resp.json()["nickname"] == "新昵称"
        assert resp.json()["phone"] == "13900139000"

    def test_update_customer_not_found(self, client):
        resp = client.patch("/api/customers/nonexistent-id", json={"nickname": "x"})
        assert resp.status_code == 404

    def test_delete_customer(self, client, sample_customer):
        # 创建一个新的来删除
        resp = client.post("/api/customers", json={**sample_customer, "nickname": "待删除客户"})
        cid = resp.json()["id"]
        resp = client.delete(f"/api/customers/{cid}")
        assert resp.status_code == 200
        # 删除后读取应 404
        resp = client.get(f"/api/customers/{cid}")
        assert resp.status_code == 404

    def test_delete_customer_not_found(self, client):
        resp = client.delete("/api/customers/nonexistent-id")
        assert resp.status_code == 404

    def test_customer_fields_complete(self, client, created_customer):
        """验证返回字段完整性"""
        data = created_customer
        required_fields = ["id", "nickname", "name", "gender", "phone", "traffic_source",
                           "traffic_source_detail", "created_at", "updated_at", "visit_count"]
        for field in required_fields:
            assert field in data, f"缺少字段: {field}"


class TestCustomerTrafficSource:
    """流量来源相关"""

    def test_create_with_traffic_source(self, client):
        resp = client.post("/api/customers", json={
            "nickname": "引流测试",
            "traffic_source": "抖音",
            "traffic_source_detail": "https://douyin.com/xxx",
        })
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "抖音"
        assert resp.json()["traffic_source_detail"] == "https://douyin.com/xxx"

    def test_create_with_friend_referral(self, client):
        resp = client.post("/api/customers", json={
            "nickname": "推荐测试",
            "traffic_source": "好友推荐",
            "traffic_source_detail": "老客户小明",
        })
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "好友推荐"

    def test_create_without_traffic_source(self, client):
        resp = client.post("/api/customers", json={"nickname": "无来源客户"})
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == ""


class TestCustomerEdgeCases:
    """边界情况"""

    def test_create_minimal_customer(self, client):
        """只填昵称"""
        resp = client.post("/api/customers", json={"nickname": "最小客户"})
        assert resp.status_code == 200
        assert resp.json()["nickname"] == "最小客户"

    def test_create_empty_nickname(self, client):
        """空昵称"""
        resp = client.post("/api/customers", json={"nickname": ""})
        assert resp.status_code == 200  # 后端允许空昵称

    def test_update_traffic_source(self, client, created_customer):
        cid = created_customer["id"]
        resp = client.patch(f"/api/customers/{cid}", json={
            "traffic_source": "朋友圈",
            "traffic_source_detail": "店主小李",
        })
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "朋友圈"
        assert resp.json()["traffic_source_detail"] == "店主小李"
