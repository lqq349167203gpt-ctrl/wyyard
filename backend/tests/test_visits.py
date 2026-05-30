"""到访记录 API 测试"""
import pytest


class TestVisitCRUD:
    """到访记录增删改查"""

    def test_list_visits(self, client):
        resp = client.get("/api/visits")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_visits_by_date(self, client):
        resp = client.get("/api/visits?date=2026-01-01")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_visit(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "arrived": True,
            "arrival_time": "10:30",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["visit_date"] == "2026-05-27"
        assert data["customer_id"] == created_customer["id"]
        assert data["arrived"] is True
        assert data["id"] is not None

    def test_get_visit(self, client, created_customer):
        # 创建
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        # 读取
        resp = client.get(f"/api/visits/{vid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == vid

    def test_get_visit_not_found(self, client):
        resp = client.get("/api/visits/nonexistent-id")
        assert resp.status_code == 404

    def test_update_visit(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        resp = client.patch(f"/api/visits/{vid}", json={
            "arrived": True,
            "arrival_time": "14:00",
            "needs": "放松身心",
            "experience": "体验很好",
            "feedback": "感谢反馈",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["arrived"] is True
        assert data["needs"] == "放松身心"
        assert data["experience"] == "体验很好"
        assert data["feedback"] == "感谢反馈"

    def test_update_visit_not_found(self, client):
        resp = client.patch("/api/visits/nonexistent-id", json={"arrived": True})
        assert resp.status_code == 404

    def test_delete_visit(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        resp = client.delete(f"/api/visits/{vid}")
        assert resp.status_code == 200
        # 删除后读取应 404
        resp = client.get(f"/api/visits/{vid}")
        assert resp.status_code == 404

    def test_delete_visit_not_found(self, client):
        resp = client.delete("/api/visits/nonexistent-id")
        assert resp.status_code == 404

    def test_visit_fields_complete(self, client, created_customer):
        """验证返回字段完整性"""
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        data = resp.json()
        required_fields = ["id", "visit_date", "customer_id", "nickname",
                           "created_at", "updated_at", "visit_count", "member_type"]
        for field in required_fields:
            assert field in data, f"缺少字段: {field}"


class TestVisitSearch:
    """到访记录搜索"""

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/visits/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_search_customers_empty(self, client):
        resp = client.get("/api/visits/search-customers?q=不存在的名字xyz")
        assert resp.status_code == 200
        assert resp.json() == []


class TestVisitEdgeCases:
    """边界情况"""

    def test_create_visit_with_activity_participation(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "activity_participation": [
                {"name": "觉醒游戏", "role": "组长", "participated": True},
            ],
        })
        assert resp.status_code == 200
        assert len(resp.json()["activity_participation"]) == 1

    def test_create_visit_with_feedback_fields(self, client, created_customer):
        """测试 experience 和 feedback 字段"""
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "experience": "活动体验内容",
            "feedback": "疗愈师回复内容",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["experience"] == "活动体验内容"
        assert data["feedback"] == "疗愈师回复内容"

    def test_list_visits_by_customer(self, client, created_customer):
        # 创建一条记录
        client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        resp = client.get(f"/api/visits?customer_id={created_customer['id']}")
        assert resp.status_code == 200
        visits = resp.json()
        assert len(visits) >= 1
        assert all(v["customer_id"] == created_customer["id"] for v in visits)
