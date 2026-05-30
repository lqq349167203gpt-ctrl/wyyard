"""活动模块 API 测试 — 课程记录、觉醒游戏、情绪释放、能量结、内部课程"""
import pytest


# ===== 课程记录 (Class Records) =====

class TestClassRecords:
    def test_list(self, client):
        resp = client.get("/api/class-records")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_by_date(self, client):
        resp = client.get("/api/class-records?date=2026-01-01")
        assert resp.status_code == 200

    def test_create(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-05-27",
            "course_id": "test-course-001",
            "course_name": "测试沙龙",
            "start_time": "10:00",
            "end_time": "12:00",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["course_name"] == "测试沙龙"
        assert data["id"] is not None

    def test_update(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-05-27", "course_id": "c1", "course_name": "待更新",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/class-records/{rid}", json={"course_name": "已更新"})
        assert resp.status_code == 200
        assert resp.json()["course_name"] == "已更新"

    def test_update_participants(self, client, created_customer):
        resp = client.post("/api/class-records", json={
            "date": "2026-05-27", "course_id": "c1", "course_name": "参与测试",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/class-records/{rid}/participants", json={
            "participant_ids": [created_customer["id"]],
        })
        assert resp.status_code == 200

    def test_update_groups(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-05-27", "course_id": "c1", "course_name": "分组测试",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/class-records/{rid}/groups", json={
            "groups": [{"name": "A组", "leader_id": "", "deputy_id": "", "member_ids": []}],
        })
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-05-27", "course_id": "c1", "course_name": "待删除",
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/class-records/{rid}")
        assert resp.status_code == 200

    def test_search_customers(self, client):
        resp = client.get("/api/class-records/search-customers?q=test")
        assert resp.status_code == 200


# ===== 觉醒游戏主记录 (Group Cases) =====

class TestGroupCases:
    def test_list(self, client):
        resp = client.get("/api/group-cases")
        assert resp.status_code == 200

    def test_create(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "purchase_count": 3,
            "amount": 999.0,
        })
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 3

    def test_update(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        })
        cid = resp.json()["id"]
        resp = client.patch(f"/api/group-cases/{cid}", json={"purchase_count": 5})
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 5

    def test_delete(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        })
        cid = resp.json()["id"]
        resp = client.delete(f"/api/group-cases/{cid}")
        assert resp.status_code == 200


# ===== 觉醒游戏场次 (Group Case Sessions) =====

class TestGroupCaseSessions:
    def test_list(self, client):
        resp = client.get("/api/group-case-sessions")
        assert resp.status_code == 200

    def test_list_by_date(self, client):
        resp = client.get("/api/group-case-sessions?date=2026-01-01")
        assert resp.status_code == 200

    def test_create(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-05-27",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "description": "测试场次",
        })
        assert resp.status_code == 200
        assert resp.json()["description"] == "测试场次"

    def test_update(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-05-27",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/group-case-sessions/{sid}", json={"description": "已更新"})
        assert resp.status_code == 200

    def test_delete(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-05-27",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.delete(f"/api/group-case-sessions/{sid}")
        assert resp.status_code == 200


# ===== 情绪释放主记录 =====

class TestEmotionalReleases:
    def test_list(self, client):
        resp = client.get("/api/emotional-releases")
        assert resp.status_code == 200

    def test_create_and_delete(self, client, created_customer):
        resp = client.post("/api/emotional-releases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/emotional-releases/{rid}")
        assert resp.status_code == 200


# ===== 情绪释放场次 =====

class TestEmotionalReleaseSessions:
    def test_list(self, client):
        resp = client.get("/api/emotional-release-sessions")
        assert resp.status_code == 200

    def test_create_and_delete(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-05-27",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200
        sid = resp.json()["id"]
        resp = client.delete(f"/api/emotional-release-sessions/{sid}")
        assert resp.status_code == 200


# ===== 能量结主记录 =====

class TestEnergyKnots:
    def test_list(self, client):
        resp = client.get("/api/energy-knots")
        assert resp.status_code == 200

    def test_create_and_delete(self, client, created_customer):
        resp = client.post("/api/energy-knots", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/energy-knots/{rid}")
        assert resp.status_code == 200


# ===== 能量结场次 =====

class TestEnergyKnotSessions:
    def test_list(self, client):
        resp = client.get("/api/energy-knot-sessions")
        assert resp.status_code == 200

    def test_create_and_delete(self, client, created_customer):
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-05-27",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200
        sid = resp.json()["id"]
        resp = client.delete(f"/api/energy-knot-sessions/{sid}")
        assert resp.status_code == 200


# ===== 内部课程主记录 =====

class TestInternalCourses:
    def test_list(self, client):
        resp = client.get("/api/internal-courses")
        assert resp.status_code == 200

    def test_create_and_delete(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "测试类型",
            "price": 100.0,
            "effective_date": "2026-05-27",
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/internal-courses/{rid}")
        assert resp.status_code == 200


# ===== 内部课程场次 =====

class TestInternalCourseSessions:
    def test_list(self, client):
        resp = client.get("/api/internal-course-sessions")
        assert resp.status_code == 200

    def test_create_and_delete(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-05-27",
            "course_type": "测试类型",
            "course_name": "测试课程",
        })
        assert resp.status_code == 200
        sid = resp.json()["id"]
        resp = client.delete(f"/api/internal-course-sessions/{sid}")
        assert resp.status_code == 200
