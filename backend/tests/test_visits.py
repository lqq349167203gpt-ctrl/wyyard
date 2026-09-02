"""到访记录 API 测试"""


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
        assert data["feedback"].endswith("不闹：感谢反馈")

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


class TestVisitVerification:
    def test_verified_visit_only_allows_three_collaboration_categories(self, client, created_customer):
        date = "2099-08-18"
        space_id = "space-visit-verification"
        created = client.post("/api/visits", json={
            "visit_date": date,
            "visit_time": "10:00",
            "customer_id": created_customer["id"],
            "space_id": space_id,
        })
        assert created.status_code == 200
        visit_id = created.json()["id"]

        verified = client.post("/api/visit-verifications/verify", json={
            "date": date,
            "space_id": space_id,
        })
        assert verified.status_code == 200
        assert verified.json()["is_verified"] is True
        assert verified.json()["verified_by"] == "不闹"
        verify_logs = client.get(
            "/api/operation-logs",
            params={"entity_id": f"{date}:{space_id}", "method": "POST"},
        ).json()
        assert any(log["content"] == f"核对并锁定邀约：{date}" for log in verify_logs)

        protected_update = client.patch(f"/api/visits/{visit_id}", json={"visit_time": "11:00"})
        assert protected_update.status_code == 423
        assert client.delete(f"/api/visits/{visit_id}").status_code == 423
        assert client.post("/api/visits", json={
            "visit_date": date,
            "customer_id": created_customer["id"],
            "space_id": space_id,
        }).status_code == 423

        collaboration_update = client.patch(f"/api/visits/{visit_id}", json={
            "needs": "补充来访需求",
            "feedback": "补充客户信息",
            "healing_notes": "补充跟进点",
        })
        assert collaboration_update.status_code == 200
        categories = {
            note["category"]
            for note in client.get(f"/api/visit-notes?visit_id={visit_id}").json()
        }
        assert categories == {"visit_need", "customer_info", "follow_up"}

        unlocked = client.post("/api/visit-verifications/unverify", json={
            "date": date,
            "space_id": space_id,
        })
        assert unlocked.status_code == 200
        assert unlocked.json()["is_verified"] is False
        unlock_logs = client.get(
            "/api/operation-logs",
            params={"entity_id": f"{date}:{space_id}", "method": "POST"},
        ).json()
        assert any(log["content"] == f"解锁邀约：{date}" for log in unlock_logs)
        assert client.patch(f"/api/visits/{visit_id}", json={"visit_time": "11:00"}).status_code == 200
        assert client.delete(f"/api/visits/{visit_id}").status_code == 200
