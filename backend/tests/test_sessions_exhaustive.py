"""活动场次穷举测试 — 5种场次类型，逐字段、逐角色验证"""
import pytest
import uuid


def _u():
    return uuid.uuid4().hex[:12]


# ===== 沙龙记录 (Class Records) =====

class TestClassRecordFull:
    """沙龙记录完整测试"""

    def test_create_basic(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-08-01",
            "course_id": "c1",
            "course_name": "晨间沙龙",
        })
        assert resp.status_code == 200
        assert resp.json()["course_name"] == "晨间沙龙"

    def test_create_with_time(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-08-02",
            "course_id": "c1",
            "course_name": "测试沙龙",
            "start_time": "09:00",
            "end_time": "11:00",
        })
        assert resp.status_code == 200
        assert resp.json()["start_time"] == "09:00"
        assert resp.json()["end_time"] == "11:00"

    def test_create_with_space(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-08-03",
            "course_id": "c1",
            "course_name": "空间测试",
            "space_id": "s1",
            "room_id": "r1",
        })
        assert resp.status_code == 200

    def test_create_with_public_welfare(self, client):
        """公益活动标记"""
        resp = client.post("/api/class-records", json={
            "date": "2026-08-04",
            "course_id": "c1",
            "course_name": "公益沙龙",
            "is_public_welfare": True,
        })
        assert resp.status_code == 200
        assert resp.json()["is_public_welfare"] is True

    def test_create_with_teachers(self, client, created_customer):
        """带课程老师"""
        resp = client.post("/api/class-records", json={
            "date": "2026-08-05",
            "course_id": "c1",
            "course_name": "老师测试",
            "teacher_ids": [created_customer["id"]],
        })
        assert resp.status_code == 200
        assert created_customer["id"] in resp.json()["teacher_ids"]

    def test_update_basic(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-08-10", "course_id": "c1", "course_name": "待更新",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/class-records/{rid}", json={"course_name": "已更新"})
        assert resp.status_code == 200
        assert resp.json()["course_name"] == "已更新"

    def test_update_time(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-08-11", "course_id": "c1", "course_name": "时间测试",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/class-records/{rid}", json={"start_time": "14:00", "end_time": "16:00"})
        assert resp.status_code == 200

    def test_update_participants(self, client, created_customer):
        resp = client.post("/api/class-records", json={
            "date": "2026-08-12", "course_id": "c1", "course_name": "参与测试",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/class-records/{rid}/participants", json={
            "participant_ids": [created_customer["id"]],
        })
        assert resp.status_code == 200

    def test_update_participants_multiple(self, client, created_customer):
        """多人参与"""
        resp = client.post("/api/class-records", json={
            "date": "2026-08-13", "course_id": "c1", "course_name": "多人测试",
        })
        rid = resp.json()["id"]
        # 创建更多客户
        cids = [created_customer["id"]]
        for i in range(3):
            r = client.post("/api/customers", json={"nickname": f"多人_{_u()}"})
            cids.append(r.json()["id"])
        resp = client.patch(f"/api/class-records/{rid}/participants", json={"participant_ids": cids})
        assert resp.status_code == 200

    def test_update_participants_clear(self, client, created_customer):
        """清空参与人"""
        resp = client.post("/api/class-records", json={
            "date": "2026-08-14", "course_id": "c1", "course_name": "清空测试",
        })
        rid = resp.json()["id"]
        client.patch(f"/api/class-records/{rid}/participants", json={"participant_ids": [created_customer["id"]]})
        resp = client.patch(f"/api/class-records/{rid}/participants", json={"participant_ids": []})
        assert resp.status_code == 200

    def test_update_groups(self, client, created_customer):
        """分组"""
        resp = client.post("/api/class-records", json={
            "date": "2026-08-15", "course_id": "c1", "course_name": "分组测试",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/class-records/{rid}/groups", json={
            "groups": [
                {"name": "A组", "leader_id": created_customer["id"], "deputy_id": "", "member_ids": []},
                {"name": "B组", "leader_id": "", "deputy_id": "", "member_ids": []},
            ],
        })
        assert resp.status_code == 200

    def test_update_groups_multiple_members(self, client, created_customer):
        """分组：多人"""
        resp = client.post("/api/class-records", json={
            "date": "2026-08-16", "course_id": "c1", "course_name": "多人分组",
        })
        rid = resp.json()["id"]
        cids = [created_customer["id"]]
        for i in range(4):
            r = client.post("/api/customers", json={"nickname": f"组员_{_u()}"})
            cids.append(r.json()["id"])
        resp = client.patch(f"/api/class-records/{rid}/groups", json={
            "groups": [
                {"name": "A组", "leader_id": cids[0], "deputy_id": cids[1], "member_ids": [cids[2]]},
                {"name": "B组", "leader_id": cids[3], "deputy_id": "", "member_ids": [cids[4]]},
            ],
        })
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/class-records", json={
            "date": "2026-08-20", "course_id": "c1", "course_name": "待删",
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/class-records/{rid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/class-records/nonexistent")
        assert resp.status_code == 404

    def test_list(self, client):
        resp = client.get("/api/class-records")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_by_date(self, client):
        client.post("/api/class-records", json={
            "date": "2026-08-21", "course_id": "c1", "course_name": "日期筛选",
        })
        resp = client.get("/api/class-records?date=2026-08-21")
        assert resp.status_code == 200

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/class-records/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200

    def test_search_customers_empty(self, client):
        resp = client.get("/api/class-records/search-customers?q=")
        assert resp.status_code == 200
        assert resp.json() == []


# ===== 觉醒游戏场次 (Group Case Sessions) =====

class TestGroupCaseSessionFull:
    """觉醒游戏场次完整测试"""

    def test_create_basic(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-01",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200

    def test_conversion_mode_skips_duplicate_side_effects(self, client, created_customer, monkeypatch):
        from app.api import group_case_sessions as group_case_sessions_api
        from app.services import group_case_session_service

        identity_refreshes = []
        notifications = []
        monkeypatch.setattr(
            group_case_session_service,
            "_refresh_affected_identities",
            lambda customer_ids: identity_refreshes.append(customer_ids),
        )
        monkeypatch.setattr(
            group_case_sessions_api.activity_assignment_notification_service,
            "notify_new_assignments",
            lambda *args, **kwargs: notifications.append((args, kwargs)),
        )

        resp = client.post("/api/group-case-sessions?conversion=true", json={
            "date": "2026-08-01",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200
        session_id = resp.json()["id"]

        deleted = client.delete(f"/api/group-case-sessions/{session_id}?conversion=true")
        assert deleted.status_code == 200
        assert identity_refreshes == []
        assert notifications == []

    def test_create_with_description(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-02",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "description": "觉醒游戏场次描述",
        })
        assert resp.status_code == 200
        assert resp.json()["description"] == "觉醒游戏场次描述"

    def test_create_with_host(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-03",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "host_id": "host-001",
            "host_name": "主持人A",
        })
        assert resp.status_code == 200

    def test_create_with_achiever(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-04",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "achiever_id": "ach-001",
            "achiever_name": "成就君A",
        })
        assert resp.status_code == 200

    def test_create_with_participants(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-05",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "participant_ids": ["p1", "p2", "p3"],
        })
        assert resp.status_code == 200
        assert len(resp.json()["participant_ids"]) == 3

    def test_create_with_space(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-06",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "space_id": "s1",
            "room_id": "r1",
        })
        assert resp.status_code == 200

    def test_create_with_time(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-07",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "start_time": "14:00",
            "end_time": "16:00",
        })
        assert resp.status_code == 200

    def test_create_all_fields(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-08",
            "start_time": "10:00",
            "end_time": "12:00",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "description": "完整场次",
            "participant_ids": ["p1"],
            "achiever_id": "a1",
            "achiever_name": "成就君",
            "host_id": "h1",
            "host_name": "主持人",
            "space_id": "s1",
            "room_id": "r1",
        })
        assert resp.status_code == 200

    def test_update_description(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-10",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/group-case-sessions/{sid}", json={"description": "新描述"})
        assert resp.status_code == 200

    def test_update_participants(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-11",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/group-case-sessions/{sid}", json={"participant_ids": ["new1", "new2"]})
        assert resp.status_code == 200

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/group-case-sessions/nonexistent", json={"description": "x"})
        assert resp.status_code == 404

    def test_delete(self, client, created_customer):
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-08-20",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.delete(f"/api/group-case-sessions/{sid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/group-case-sessions/nonexistent")
        assert resp.status_code == 404

    def test_list(self, client):
        resp = client.get("/api/group-case-sessions")
        assert resp.status_code == 200

    def test_list_by_date(self, client, created_customer):
        client.post("/api/group-case-sessions", json={
            "date": "2026-08-21",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        resp = client.get("/api/group-case-sessions?date=2026-08-21")
        assert resp.status_code == 200

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/group-case-sessions/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200


# ===== 情绪释放场次 =====

class TestEmotionalReleaseSessionFull:
    def test_create_basic(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-01",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200

    def test_create_with_description(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-02",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "description": "情绪释放描述",
        })
        assert resp.status_code == 200
        assert resp.json()["description"] == "情绪释放描述"

    def test_create_with_host(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-03",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "host_id": "h1",
            "host_name": "主持人",
        })
        assert resp.status_code == 200

    def test_create_with_achiever(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-04",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "achiever_id": "a1",
            "achiever_name": "成就君",
        })
        assert resp.status_code == 200

    def test_create_with_participants(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-05",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "participant_ids": ["p1", "p2"],
        })
        assert resp.status_code == 200

    def test_create_with_time_space(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-06",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "start_time": "10:00",
            "end_time": "12:00",
            "space_id": "s1",
            "room_id": "r1",
        })
        assert resp.status_code == 200

    def test_update(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-10",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/emotional-release-sessions/{sid}", json={"description": "更新"})
        assert resp.status_code == 200

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/emotional-release-sessions/nonexistent", json={"description": "x"})
        assert resp.status_code == 404

    def test_delete(self, client, created_customer):
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-20",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.delete(f"/api/emotional-release-sessions/{sid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/emotional-release-sessions/nonexistent")
        assert resp.status_code == 404

    def test_list(self, client):
        resp = client.get("/api/emotional-release-sessions")
        assert resp.status_code == 200

    def test_list_by_date(self, client, created_customer):
        client.post("/api/emotional-release-sessions", json={
            "date": "2026-08-21",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        resp = client.get("/api/emotional-release-sessions?date=2026-08-21")
        assert resp.status_code == 200

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/emotional-release-sessions/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200


# ===== 能量结场次 =====

class TestEnergyKnotSessionFull:
    def test_create_basic(self, client, created_customer):
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-01",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200

    def test_create_with_description(self, client, created_customer):
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-02",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "description": '[{"id":"owner-1","name":"测试案主","count":2}]',
            "course_description": "能量结活动简介\n支持换行",
        })
        assert resp.status_code == 200
        assert resp.json()["course_description"] == "能量结活动简介\n支持换行"

    def test_create_with_hosts(self, client, created_customer):
        """多课程老师"""
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-03",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "teacher_ids": ["t1", "t2"],
        })
        assert resp.status_code == 200
        assert len(resp.json()["teacher_ids"]) == 2

    def test_create_with_participants(self, client, created_customer):
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-04",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "participant_ids": ["p1", "p2", "p3"],
        })
        assert resp.status_code == 200

    def test_create_with_time_space(self, client, created_customer):
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-05",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "start_time": "14:00",
            "end_time": "16:00",
            "space_id": "s1",
            "room_id": "r1",
        })
        assert resp.status_code == 200

    def test_update(self, client, created_customer):
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-10",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/energy-knot-sessions/{sid}", json={"description": "更新"})
        assert resp.status_code == 200

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/energy-knot-sessions/nonexistent", json={"description": "x"})
        assert resp.status_code == 404

    def test_delete(self, client, created_customer):
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-20",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        sid = resp.json()["id"]
        resp = client.delete(f"/api/energy-knot-sessions/{sid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/energy-knot-sessions/nonexistent")
        assert resp.status_code == 404

    def test_list(self, client):
        resp = client.get("/api/energy-knot-sessions")
        assert resp.status_code == 200

    def test_list_by_date(self, client, created_customer):
        client.post("/api/energy-knot-sessions", json={
            "date": "2026-08-21",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        resp = client.get("/api/energy-knot-sessions?date=2026-08-21")
        assert resp.status_code == 200

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/energy-knot-sessions/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200


# ===== 内部课程场次 =====

class TestInternalCourseSessionFull:
    def test_create_basic(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-01",
            "course_type": "疗愈师课程",
            "course_name": "基础疗愈入门",
        })
        assert resp.status_code == 200
        assert resp.json()["course_name"] == "基础疗愈入门"

    def test_create_all_course_types(self, client):
        """所有课程类型"""
        for ct in ["疗愈师课程", "商业框架陪跑", "落地赋能班"]:
            resp = client.post("/api/internal-course-sessions", json={
                "date": "2026-08-02",
                "course_type": ct,
                "course_name": f"测试_{ct}",
            })
            assert resp.status_code == 200, f"创建 {ct} 失败"

    def test_create_with_description(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-03",
            "course_type": "疗愈师课程",
            "course_name": "描述测试",
            "course_description": "课程详细描述",
        })
        assert resp.status_code == 200

    def test_create_with_hosts(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-04",
            "course_type": "疗愈师课程",
            "course_name": "老师测试",
            "host_ids": ["h1", "h2"],
            "host_names": ["老师A", "老师B"],
        })
        assert resp.status_code == 200

    def test_create_with_participants(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-05",
            "course_type": "疗愈师课程",
            "course_name": "参与测试",
            "participant_ids": ["p1", "p2"],
        })
        assert resp.status_code == 200

    def test_create_with_time_space(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-06",
            "course_type": "疗愈师课程",
            "course_name": "空间测试",
            "start_time": "09:00",
            "end_time": "12:00",
            "space_id": "s1",
            "room_id": "r1",
        })
        assert resp.status_code == 200

    def test_create_all_fields(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-07",
            "start_time": "10:00",
            "end_time": "12:00",
            "course_type": "疗愈师课程",
            "course_name": "完整课程",
            "course_description": "完整描述",
            "host_ids": ["h1"],
            "host_names": ["老师"],
            "participant_ids": ["p1", "p2"],
            "space_id": "s1",
            "room_id": "r1",
        })
        assert resp.status_code == 200

    def test_update_name(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-10",
            "course_type": "疗愈师课程",
            "course_name": "待更新",
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/internal-course-sessions/{sid}", json={"course_name": "已更新"})
        assert resp.status_code == 200
        assert resp.json()["course_name"] == "已更新"

    def test_update_type(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-11",
            "course_type": "疗愈师课程",
            "course_name": "类型测试",
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/internal-course-sessions/{sid}", json={"course_type": "落地赋能班"})
        assert resp.status_code == 200

    def test_update_participants(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-12",
            "course_type": "疗愈师课程",
            "course_name": "参与更新",
        })
        sid = resp.json()["id"]
        resp = client.patch(f"/api/internal-course-sessions/{sid}", json={"participant_ids": ["new1"]})
        assert resp.status_code == 200

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/internal-course-sessions/nonexistent", json={"course_name": "x"})
        assert resp.status_code == 404

    def test_delete(self, client):
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-08-20",
            "course_type": "疗愈师课程",
            "course_name": "待删",
        })
        sid = resp.json()["id"]
        resp = client.delete(f"/api/internal-course-sessions/{sid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/internal-course-sessions/nonexistent")
        assert resp.status_code == 404

    def test_list(self, client):
        resp = client.get("/api/internal-course-sessions")
        assert resp.status_code == 200

    def test_list_by_date(self, client):
        client.post("/api/internal-course-sessions", json={
            "date": "2026-08-21",
            "course_type": "疗愈师课程",
            "course_name": "日期筛选",
        })
        resp = client.get("/api/internal-course-sessions?date=2026-08-21")
        assert resp.status_code == 200

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/internal-course-sessions/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200
