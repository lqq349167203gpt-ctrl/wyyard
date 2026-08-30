"""权限 + 提醒 + 课程类型 API 测试"""
import uuid


def _u(suffix=""):
    return f"{uuid.uuid4().hex[:12]}{suffix}"


# ===== 角色 (Positions) =====

class TestPositions:
    def test_list(self, client):
        resp = client.get("/api/positions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        # 唯一后缀命名，避免与历史残留数据冲突（400 名称已存在）
        name = f"测试角色Pos_{_u()}"
        resp = client.post("/api/positions", json={"name": name})
        assert resp.status_code == 200
        assert resp.json()["name"] == name
        assert resp.json()["id"] is not None

    def test_update(self, client):
        resp = client.post("/api/positions", json={"name": f"待更新Pos_{_u()}"})
        pid = resp.json()["id"]
        resp = client.patch(f"/api/positions/{pid}", json={"name": f"已更新Pos_{_u()}"})
        assert resp.status_code == 200
        # 清理，避免残留
        client.delete(f"/api/positions/{pid}")

    def test_delete(self, client):
        resp = client.post("/api/positions", json={"name": f"待删除Pos_{_u()}"})
        pid = resp.json()["id"]
        resp = client.delete(f"/api/positions/{pid}")
        assert resp.status_code == 200

    def test_reorder(self, client):
        first = client.post("/api/positions", json={"name": f"排序角色A_{_u()}"}).json()
        second = client.post("/api/positions", json={"name": f"排序角色B_{_u()}"}).json()
        try:
            positions = client.get("/api/positions").json()
            ids = [position["id"] for position in positions]
            first_index = ids.index(first["id"])
            second_index = ids.index(second["id"])
            assert second_index == first_index + 1
            ids[first_index], ids[second_index] = ids[second_index], ids[first_index]

            response = client.put("/api/positions/reorder", json={
                "ids": ids,
                "moved_id": second["id"],
                "from_position": second_index + 1,
                "to_position": first_index + 1,
            })
            assert response.status_code == 200
            reordered_ids = [position["id"] for position in response.json()]
            assert reordered_ids[first_index:first_index + 2] == [second["id"], first["id"]]
        finally:
            client.delete(f"/api/positions/{first['id']}")
            client.delete(f"/api/positions/{second['id']}")


# ===== 角色权限 (Position Permissions) =====

class TestPositionPermissions:
    def test_get_all(self, client):
        resp = client.get("/api/position-permissions")
        assert resp.status_code == 200

    def test_get_by_position(self, client):
        # 唯一后缀命名，避免与历史残留数据冲突
        resp = client.post("/api/positions", json={"name": f"PermTestRole_{_u()}"})
        pid = resp.json()["id"]
        resp = client.get(f"/api/position-permissions/{pid}")
        assert resp.status_code == 200
        # 清理，避免残留
        client.delete(f"/api/positions/{pid}")

    def test_set_permissions(self, client):
        resp = client.post("/api/positions", json={"name": f"PermSetRole_{_u()}"})
        pid = resp.json()["id"]
        resp = client.put("/api/position-permissions", json={
            "position": pid,
            "pages": ["healing-records", "class-records"],
        })
        assert resp.status_code == 200
        # 清理，避免残留
        client.delete(f"/api/positions/{pid}")


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
        # 唯一后缀命名，避免与历史残留数据冲突（409 类型名称已存在）
        name = f"测试课程类型_{_u()}"
        resp = client.post("/api/course-types", json={"name": name})
        assert resp.status_code == 200
        assert resp.json()["name"] == name
        # 清理，避免残留
        client.delete(f"/api/course-types/{name}")

    def test_delete(self, client):
        resp = client.post("/api/course-types", json={"name": f"待删除课程类型_{_u()}"})
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
