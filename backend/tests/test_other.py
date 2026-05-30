"""权限 + 提醒 + 课程类型 API 测试"""
import pytest


# ===== 角色 (Positions) =====

class TestPositions:
    def test_list(self, client):
        resp = client.get("/api/positions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/positions", json={"name": "测试角色Pos"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试角色Pos"
        assert resp.json()["id"] is not None

    def test_update(self, client):
        resp = client.post("/api/positions", json={"name": "待更新Pos"})
        pid = resp.json()["id"]
        resp = client.patch(f"/api/positions/{pid}", json={"name": "已更新Pos"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/positions", json={"name": "待删除Pos"})
        pid = resp.json()["id"]
        resp = client.delete(f"/api/positions/{pid}")
        assert resp.status_code == 200


# ===== 角色权限 (Position Permissions) =====

class TestPositionPermissions:
    def test_get_all(self, client):
        resp = client.get("/api/position-permissions")
        assert resp.status_code == 200

    def test_get_by_position(self, client):
        resp = client.post("/api/positions", json={"name": "PermTestRole"})
        pid = resp.json()["id"]
        resp = client.get(f"/api/position-permissions/{pid}")
        assert resp.status_code == 200

    def test_set_permissions(self, client):
        resp = client.post("/api/positions", json={"name": "PermSetRole"})
        pid = resp.json()["id"]
        resp = client.put("/api/position-permissions", json={
            "position": pid,
            "pages": ["healing-records", "class-records"],
        })
        assert resp.status_code == 200


# ===== 提醒配置 (Reminders) =====

class TestReminders:
    def test_list(self, client):
        resp = client.get("/api/reminders")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/reminders", json={
            "name": "测试提醒",
            "days_before": 3,
            "enabled": True,
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试提醒"

    def test_update(self, client):
        resp = client.post("/api/reminders", json={
            "name": "待更新提醒", "days_before": 1, "enabled": True,
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/reminders/{rid}", json={"name": "已更新提醒"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/reminders", json={
            "name": "待删除提醒", "days_before": 1, "enabled": True,
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/reminders/{rid}")
        assert resp.status_code == 200


# ===== 业务提醒 (Business Reminders) =====

class TestBusinessReminders:
    def test_list(self, client):
        resp = client.get("/api/business-reminders?user_id=test&user_role=超级管理员")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===== 课程类型 (Course Types) =====

class TestCourseTypes:
    def test_list(self, client):
        resp = client.get("/api/course-types")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/course-types", json={"name": "测试课程类型"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试课程类型"

    def test_delete(self, client):
        resp = client.post("/api/course-types", json={"name": "待删除课程类型"})
        name = resp.json()["name"]
        resp = client.delete(f"/api/course-types/{name}")
        assert resp.status_code == 200


# ===== 课程 (Courses) =====

class TestCourses:
    def test_list(self, client):
        resp = client.get("/api/courses")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/courses", json={
            "name": "测试课程",
            "type": "沙龙",
            "description": "课程描述",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试课程"

    def test_update(self, client):
        resp = client.post("/api/courses", json={"name": "待更新课程", "type": "沙龙"})
        cid = resp.json()["id"]
        resp = client.patch(f"/api/courses/{cid}", json={"name": "已更新课程"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/courses", json={"name": "待删除课程", "type": "沙龙"})
        cid = resp.json()["id"]
        resp = client.delete(f"/api/courses/{cid}")
        assert resp.status_code == 200


# ===== 日程分组 (Daily Groupings) =====

class TestDailyGroupings:
    def test_get(self, client):
        resp = client.get("/api/daily-groupings?date=2026-01-01")
        assert resp.status_code == 200

    def test_upsert(self, client):
        resp = client.put("/api/daily-groupings", json={
            "date": "2026-05-27",
            "groups": [{"name": "A组", "members": []}],
        })
        assert resp.status_code == 200


# ===== 操作日志 / 系统日志 =====

class TestLogs:
    def test_operation_logs(self, client):
        resp = client.get("/api/operation-logs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_system_logs(self, client):
        resp = client.get("/api/system-logs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===== 健康检查 =====

class TestHealth:
    def test_health(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
