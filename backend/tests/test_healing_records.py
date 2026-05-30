"""疗愈记录 API 测试"""
import pytest


class TestHealingRecordCRUD:
    """疗愈记录增删改查"""

    def test_list_records(self, client):
        resp = client.get("/api/healing-records")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_records_by_customer(self, client, created_customer):
        resp = client.get(f"/api/healing-records?customer_id={created_customer['id']}")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_record(self, client, created_customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["name"],
            "date": "2026-05-27",
            "title": "首次疗愈",
            "growth_record": "客户表现出积极的参与态度",
            "teacher": "王老师",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "首次疗愈"
        assert data["customer_id"] == created_customer["id"]
        assert data["teacher"] == "王老师"
        assert data["id"] is not None

    def test_get_record(self, client, created_customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "date": "2026-05-27",
            "title": "测试记录",
        })
        rid = resp.json()["id"]
        resp = client.get(f"/api/healing-records/{rid}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "测试记录"

    def test_get_record_not_found(self, client):
        resp = client.get("/api/healing-records/nonexistent-id")
        assert resp.status_code == 404

    def test_update_record(self, client, created_customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "date": "2026-05-27",
            "title": "待更新",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/healing-records/{rid}", json={
            "title": "已更新",
            "growth_record": "新增成长记录",
        })
        assert resp.status_code == 200
        assert resp.json()["title"] == "已更新"
        assert resp.json()["growth_record"] == "新增成长记录"

    def test_update_record_not_found(self, client):
        resp = client.patch("/api/healing-records/nonexistent-id", json={"title": "x"})
        assert resp.status_code == 404

    def test_delete_record(self, client, created_customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "date": "2026-05-27",
            "title": "待删除",
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/healing-records/{rid}")
        assert resp.status_code == 200
        resp = client.get(f"/api/healing-records/{rid}")
        assert resp.status_code == 404

    def test_delete_record_not_found(self, client):
        resp = client.delete("/api/healing-records/nonexistent-id")
        assert resp.status_code == 404


class TestHealingRecordSearch:
    """疗愈记录搜索"""

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/healing-records/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_by_customer_date(self, client, created_customer):
        # 先创建
        client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "date": "2026-05-27",
            "title": "日期查询测试",
        })
        resp = client.get(f"/api/healing-records/by-customer-date?customer_id={created_customer['id']}&date=2026-05-27")
        assert resp.status_code == 200


class TestHealingRecordEdgeCases:
    """边界情况"""

    def test_create_minimal_record(self, client, created_customer):
        """只填必填字段"""
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "date": "2026-05-27",
            "title": "最小记录",
        })
        assert resp.status_code == 200

    def test_record_fields_complete(self, client, created_customer):
        """验证返回字段完整性"""
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "date": "2026-05-27",
            "title": "字段测试",
        })
        data = resp.json()
        required_fields = ["id", "customer_id", "date", "title",
                           "created_at", "updated_at", "growth_record", "teacher"]
        for field in required_fields:
            assert field in data, f"缺少字段: {field}"
