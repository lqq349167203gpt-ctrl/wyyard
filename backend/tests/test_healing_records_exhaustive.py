"""疗愈记录穷举测试"""
import pytest
import uuid


def _u():
    return uuid.uuid4().hex[:8]


class TestHealingRecordCreate:
    """疗愈记录创建：逐字段验证"""

    def test_minimal_create(self, client, created_customer):
        """最小必填字段"""
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-01",
            "title": "第一次疗愈",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "第一次疗愈"
        assert data["date"] == "2026-08-01"

    def test_teacher_field(self, client, created_customer):
        """疗愈师字段"""
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-02",
            "title": "测试",
            "teacher": "疗愈师李四",
        })
        assert resp.status_code == 200
        assert resp.json()["teacher"] == "疗愈师李四"

    def test_growth_record_field(self, client, created_customer):
        """成长记录字段"""
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-03",
            "title": "测试",
            "growth_record": "客户情绪改善明显，肩颈疼痛减轻",
        })
        assert resp.status_code == 200
        assert "肩颈" in resp.json()["growth_record"]

    def test_materials_field(self, client, created_customer):
        """附件字段"""
        materials = [
            {"id": "m1", "name": "记录表.pdf", "url": "/uploads/m1.pdf"},
            {"id": "m2", "name": "照片.jpg", "url": "/uploads/m2.jpg"},
        ]
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-04",
            "title": "测试",
            "materials": materials,
        })
        assert resp.status_code == 200
        assert len(resp.json()["materials"]) == 2

    def test_materials_empty(self, client, created_customer):
        """空附件"""
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-05",
            "title": "测试",
            "materials": [],
        })
        assert resp.status_code == 200

    def test_all_fields(self, client, created_customer):
        """所有字段一起填写"""
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-06",
            "title": "完整记录",
            "teacher": "疗愈师A",
            "growth_record": "成长记录内容",
            "materials": [{"id": "m1", "name": "文件", "url": "/uploads/f"}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["teacher"] == "疗愈师A"
        assert data["growth_record"] == "成长记录内容"
        assert len(data["materials"]) == 1


class TestHealingRecordUpdate:
    """疗愈记录更新"""

    def _create(self, client, customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": customer["id"],
            "customer_name": customer["nickname"],
            "date": "2026-08-10",
            "title": "待更新",
        })
        return resp.json()["id"]

    def test_update_title(self, client, created_customer):
        rid = self._create(client, created_customer)
        resp = client.patch(f"/api/healing-records/{rid}", json={"title": "新标题"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "新标题"

    def test_update_teacher(self, client, created_customer):
        rid = self._create(client, created_customer)
        resp = client.patch(f"/api/healing-records/{rid}", json={"teacher": "新老师"})
        assert resp.status_code == 200
        assert resp.json()["teacher"] == "新老师"

    def test_update_growth_record(self, client, created_customer):
        rid = self._create(client, created_customer)
        resp = client.patch(f"/api/healing-records/{rid}", json={"growth_record": "新记录"})
        assert resp.status_code == 200
        assert resp.json()["growth_record"] == "新记录"

    def test_update_materials(self, client, created_customer):
        rid = self._create(client, created_customer)
        resp = client.patch(f"/api/healing-records/{rid}", json={
            "materials": [{"id": "new", "name": "新文件", "url": "/uploads/new"}],
        })
        assert resp.status_code == 200
        assert len(resp.json()["materials"]) == 1

    def test_update_date(self, client, created_customer):
        rid = self._create(client, created_customer)
        resp = client.patch(f"/api/healing-records/{rid}", json={"date": "2026-08-20"})
        assert resp.status_code == 200
        assert resp.json()["date"] == "2026-08-20"

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/healing-records/nonexistent", json={"title": "x"})
        assert resp.status_code == 404


class TestHealingRecordDelete:
    """疗愈记录删除"""

    def test_delete_existing(self, client, created_customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-30",
            "title": "待删",
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/healing-records/{rid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/healing-records/nonexistent")
        assert resp.status_code == 404

    def test_deleted_not_in_list(self, client, created_customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-08-31",
            "title": "删后检查",
        })
        rid = resp.json()["id"]
        client.delete(f"/api/healing-records/{rid}")
        resp = client.get("/api/healing-records")
        assert not any(r["id"] == rid for r in resp.json())


class TestHealingRecordQuery:
    """疗愈记录查询"""

    def test_list_all(self, client):
        resp = client.get("/api/healing-records")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_by_customer(self, client, created_customer):
        client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-09-01",
            "title": "筛选测试",
        })
        resp = client.get(f"/api/healing-records?customer_id={created_customer['id']}")
        assert resp.status_code == 200
        for r in resp.json():
            assert r["customer_id"] == created_customer["id"]

    def test_get_by_id(self, client, created_customer):
        resp = client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-09-02",
            "title": "GET测试",
        })
        rid = resp.json()["id"]
        resp = client.get(f"/api/healing-records/{rid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == rid

    def test_get_nonexistent(self, client):
        resp = client.get("/api/healing-records/nonexistent")
        assert resp.status_code == 404

    def test_by_customer_date(self, client, created_customer):
        """按客户+日期查询"""
        client.post("/api/healing-records", json={
            "customer_id": created_customer["id"],
            "customer_name": created_customer["nickname"],
            "date": "2026-09-03",
            "title": "日期查询",
        })
        resp = client.get(f"/api/healing-records/by-customer-date?customer_id={created_customer['id']}&date=2026-09-03")
        assert resp.status_code == 200
        assert resp.json()["date"] == "2026-09-03"

    def test_by_customer_date_not_found(self, client, created_customer):
        """按客户+日期查询无结果"""
        resp = client.get(f"/api/healing-records/by-customer-date?customer_id={created_customer['id']}&date=2099-01-01")
        assert resp.status_code == 200
        # 可能返回 null 或空

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/healing-records/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200

    def test_search_customers_empty(self, client):
        resp = client.get("/api/healing-records/search-customers?q=")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_customers_nonexistent(self, client):
        resp = client.get("/api/healing-records/search-customers?q=zzz_nonexistent_zzz")
        assert resp.status_code == 200
        assert resp.json() == []
