"""客户 API 测试"""
import uuid

import pytest


def _uid():
    return uuid.uuid4().hex[:8]


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
        assert data["nickname"].startswith("测试客户A_")
        assert data["name"].startswith("张三_")
        assert data["traffic_source"] == "小红书"
        assert data["id"] is not None
        assert data["created_at"] is not None

    def test_get_customer(self, client, created_customer):
        resp = client.get(f"/api/customers/{created_customer['id']}")
        assert resp.status_code == 200
        assert resp.json()["nickname"] == created_customer["nickname"]

    def test_get_customer_not_found(self, client):
        resp = client.get("/api/customers/nonexistent-id")
        assert resp.status_code == 404

    def test_update_customer(self, client, created_customer):
        cid = created_customer["id"]
        new_nickname = f"新昵称_{_uid()}"
        resp = client.patch(f"/api/customers/{cid}", json={"nickname": new_nickname, "phone": "13900139001"})
        assert resp.status_code == 200
        assert resp.json()["nickname"] == new_nickname
        assert resp.json()["phone"] == "13900139001"

    def test_update_customer_not_found(self, client):
        resp = client.patch("/api/customers/nonexistent-id", json={"nickname": "x"})
        assert resp.status_code == 404

    def test_delete_customer(self, client, sample_customer):
        # 创建一个新的来删除
        resp = client.post("/api/customers", json={**sample_customer, "nickname": f"待删除客户_{_uid()}"})
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
                           "traffic_source_detail", "follow_up_status", "created_at", "updated_at", "visit_count"]
        for field in required_fields:
            assert field in data, f"缺少字段: {field}"


class TestCustomerTrafficSource:
    """流量来源相关"""

    def test_create_with_traffic_source(self, client):
        resp = client.post("/api/customers", json={
            "nickname": f"引流测试_{_uid()}",
            "traffic_source": "抖音",
            "traffic_source_detail": "https://douyin.com/xxx",
        })
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "抖音"
        assert resp.json()["traffic_source_detail"] == "https://douyin.com/xxx"

    def test_create_with_friend_referral(self, client):
        resp = client.post("/api/customers", json={
            "nickname": f"推荐测试_{_uid()}",
            "traffic_source": "好友推荐",
            "traffic_source_detail": "老客户小明",
        })
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "好友推荐"

    def test_create_without_traffic_source(self, client):
        resp = client.post("/api/customers", json={"nickname": f"无来源客户_{_uid()}"})
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == ""


class TestCustomerFollowUpStatus:
    def test_defaults_to_unconfigured(self, client):
        resp = client.post("/api/customers", json={"nickname": f"跟进状态_{_uid()}"})
        assert resp.status_code == 200
        customer_id = resp.json()["id"]
        assert resp.json()["follow_up_status"] == "未配置"
        client.delete(f"/api/customers/{customer_id}")

    @pytest.mark.parametrize("status", ["新添加", "前期沟通中", "已邀约未到店", "已到店", "已成交", "沉默/流失", "未配置"])
    def test_accepts_all_supported_statuses(self, client, status):
        resp = client.post("/api/customers", json={
            "nickname": f"跟进状态_{_uid()}",
            "follow_up_status": status,
        })
        assert resp.status_code == 200
        customer_id = resp.json()["id"]
        assert resp.json()["follow_up_status"] == status
        client.delete(f"/api/customers/{customer_id}")

    def test_updates_status(self, client):
        created = client.post("/api/customers", json={"nickname": f"跟进状态_{_uid()}"}).json()
        customer_id = created["id"]
        resp = client.patch(f"/api/customers/{customer_id}", json={"follow_up_status": "前期沟通中"})
        assert resp.status_code == 200
        assert resp.json()["follow_up_status"] == "前期沟通中"
        client.delete(f"/api/customers/{customer_id}")

    def test_normalizes_legacy_communicating_status(self, client):
        resp = client.post("/api/customers", json={
            "nickname": f"旧跟进状态_{_uid()}",
            "follow_up_status": "沟通中",
        })
        assert resp.status_code == 200
        customer_id = resp.json()["id"]
        assert resp.json()["follow_up_status"] == "前期沟通中"
        client.delete(f"/api/customers/{customer_id}")

    def test_rejects_unknown_status(self, client):
        resp = client.post("/api/customers", json={
            "nickname": f"跟进状态_{_uid()}",
            "follow_up_status": "未知状态",
        })
        assert resp.status_code == 422


class TestCustomerEdgeCases:
    """边界情况"""

    def test_create_minimal_customer(self, client):
        """只填昵称"""
        nickname = f"最小客户_{_uid()}"
        resp = client.post("/api/customers", json={"nickname": nickname})
        assert resp.status_code == 200
        assert resp.json()["nickname"] == nickname

    def test_create_empty_nickname(self, client):
        """空昵称 + 空手机号 → 应拒绝"""
        resp = client.post("/api/customers", json={"nickname": ""})
        assert resp.status_code == 422  # 昵称和手机号至少填写一项

    def test_update_traffic_source(self, client, created_customer):
        cid = created_customer["id"]
        resp = client.patch(f"/api/customers/{cid}", json={
            "traffic_source": "朋友圈",
            "traffic_source_detail": "店主小李",
        })
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "朋友圈"
        assert resp.json()["traffic_source_detail"] == "店主小李"
