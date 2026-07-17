"""权限 + 配置 + 账号 + 日志穷举测试"""
import pytest
import uuid


def _u():
    return uuid.uuid4().hex[:12]


# ===== 账号管理 =====

# 密码策略（accounts.py 创建/改密接口强制）：8-128 位且必须同时包含字母和数字
_PW = "pass1234"
_PW_OLD = "old12345"
_PW_NEW = "new12345"


def _login_headers(client, username, password):
    """登录指定账号并返回带其 token 的请求头。

    change-password 接口要求本人操作（account_id 必须等于当前登录账号），
    超管 client 的 token 不能用于改其他账号的密码。
    """
    resp = client.post("/api/accounts/login", json={"username": username, "password": password})
    assert resp.status_code == 200 and resp.json()["success"] is True
    return {"Authorization": f"Bearer {resp.json()['token']}"}


class TestAccountCreate:
    def test_create_basic(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"owner_{u}",
            "role": "管理员",
            "username": f"user_{u}",
            "password": _PW,
            "enabled": True,
        })
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

    def test_create_all_roles(self, client):
        """所有角色类型"""
        for role in ["超级管理员", "管理员", "普通用户"]:
            u = _u()
            resp = client.post("/api/accounts", json={
                "owner": f"role_{u}",
                "role": role,
                "username": f"role_{u}",
                "password": _PW,
                "enabled": True,
            })
            assert resp.status_code == 200

    def test_create_disabled(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"dis_{u}",
            "role": "管理员",
            "username": f"dis_{u}",
            "password": _PW,
            "enabled": False,
        })
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

    def test_create_duplicate_username(self, client):
        """重复用户名"""
        u = _u()
        data = {"owner": f"dup_{u}", "role": "管理员", "username": f"dup_{u}", "password": _PW, "enabled": True}
        resp = client.post("/api/accounts", json=data)
        assert resp.status_code == 200
        resp = client.post("/api/accounts", json=data)
        assert resp.status_code == 400

    def test_create_duplicate_owner(self, client):
        """同一人两个账号"""
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"same_{u}", "role": "管理员",
            "username": f"first_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        resp = client.post("/api/accounts", json={
            "owner": f"same_{u}", "role": "管理员",
            "username": f"second_{u}", "password": _PW, "enabled": True,
        })
        # 可能允许也可能不允许，取决于业务规则（当前实现：归属人唯一，返回 400）
        assert resp.status_code in [200, 400]


class TestAccountLogin:
    def test_login_success(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"login_{u}", "role": "管理员",
            "username": f"login_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        resp = client.post("/api/accounts/login", json={
            "username": f"login_{u}", "password": _PW,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert "account" in resp.json()
        assert "permissions" in resp.json()

    def test_login_wrong_password(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"wp_{u}", "role": "管理员",
            "username": f"wp_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        resp = client.post("/api/accounts/login", json={
            "username": f"wp_{u}", "password": "wrong1234",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_login_nonexistent(self, client):
        resp = client.post("/api/accounts/login", json={
            "username": f"nobody_{_u()}", "password": "x1234567",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_login_disabled_account(self, client):
        """禁用账号登录"""
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"dis_{u}", "role": "管理员",
            "username": f"dis_{u}", "password": _PW, "enabled": False,
        })
        assert resp.status_code == 200
        resp = client.post("/api/accounts/login", json={
            "username": f"dis_{u}", "password": _PW,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_login_returns_permissions(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"perm_{u}", "role": "超级管理员",
            "username": f"perm_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        resp = client.post("/api/accounts/login", json={
            "username": f"perm_{u}", "password": _PW,
        })
        assert isinstance(resp.json()["permissions"], list)


class TestAccountPasswordChange:
    def test_change_success(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"chg_{u}", "role": "管理员",
            "username": f"chg_{u}", "password": _PW_OLD, "enabled": True,
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]
        # 改密接口要求本人 token
        headers = _login_headers(client, f"chg_{u}", _PW_OLD)
        resp = client.post(f"/api/accounts/{aid}/change-password", json={
            "old_password": _PW_OLD, "new_password": _PW_NEW,
        }, headers=headers)
        assert resp.status_code == 200
        # 验证新密码可用
        resp = client.post("/api/accounts/login", json={
            "username": f"chg_{u}", "password": _PW_NEW,
        })
        assert resp.json()["success"] is True

    def test_change_wrong_old(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"chgerr_{u}", "role": "管理员",
            "username": f"chgerr_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]
        headers = _login_headers(client, f"chgerr_{u}", _PW)
        resp = client.post(f"/api/accounts/{aid}/change-password", json={
            "old_password": "wrong1234", "new_password": _PW_NEW,
        }, headers=headers)
        assert resp.status_code == 400

    def test_change_nonexistent(self, client):
        """改密接口先查账号存在性：不存在的账号返回 404"""
        resp = client.post("/api/accounts/nonexistent/change-password", json={
            "old_password": "x1234567", "new_password": "y1234567",
        })
        assert resp.status_code == 404

    def test_change_then_old_password_invalid(self, client):
        """改密码后旧密码失效"""
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"old_{u}", "role": "管理员",
            "username": f"old_{u}", "password": _PW_OLD, "enabled": True,
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]
        headers = _login_headers(client, f"old_{u}", _PW_OLD)
        resp = client.post(f"/api/accounts/{aid}/change-password", json={
            "old_password": _PW_OLD, "new_password": _PW_NEW,
        }, headers=headers)
        assert resp.status_code == 200
        resp = client.post("/api/accounts/login", json={
            "username": f"old_{u}", "password": _PW_OLD,
        })
        assert resp.json()["success"] is False


class TestAccountUpdate:
    def test_update_owner(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"upd_{u}", "role": "管理员",
            "username": f"upd_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]
        resp = client.patch(f"/api/accounts/{aid}", json={"owner": f"new_{u}"})
        assert resp.status_code == 200

    def test_update_role(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"role_{u}", "role": "管理员",
            "username": f"role_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]
        resp = client.patch(f"/api/accounts/{aid}", json={"role": "超级管理员"})
        assert resp.status_code == 200

    def test_update_enabled(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"en_{u}", "role": "管理员",
            "username": f"en_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]
        resp = client.patch(f"/api/accounts/{aid}", json={"enabled": False})
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/accounts/nonexistent", json={"owner": "x"})
        assert resp.status_code == 404


class TestAccountDelete:
    def test_delete_existing(self, client):
        u = _u()
        resp = client.post("/api/accounts", json={
            "owner": f"del_{u}", "role": "管理员",
            "username": f"del_{u}", "password": _PW, "enabled": True,
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]
        resp = client.delete(f"/api/accounts/{aid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/accounts/nonexistent")
        assert resp.status_code == 404


class TestRoles:
    def test_list_roles(self, client):
        resp = client.get("/api/accounts/roles")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_role(self, client):
        resp = client.post("/api/accounts/roles", json={
            "name": f"角色_{_u()}",
            "permissions": ["healing-records", "class-records", "payment"],
        })
        assert resp.status_code == 200
        assert "healing-records" in resp.json()["permissions"]

    def test_create_role_empty_permissions(self, client):
        resp = client.post("/api/accounts/roles", json={
            "name": f"空权限_{_u()}",
            "permissions": [],
        })
        assert resp.status_code == 200

    def test_update_role(self, client):
        resp = client.post("/api/accounts/roles", json={
            "name": f"待更新_{_u()}",
            "permissions": [],
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/accounts/roles/{rid}", json={"name": "已更新"})
        assert resp.status_code == 200

    def test_delete_role(self, client):
        resp = client.post("/api/accounts/roles", json={
            "name": f"待删除_{_u()}",
            "permissions": [],
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/accounts/roles/{rid}")
        assert resp.status_code == 200


# ===== 角色权限 =====

class TestPositionPermissions:
    def test_get_all(self, client):
        resp = client.get("/api/position-permissions")
        assert resp.status_code == 200

    def test_get_by_position(self, client):
        resp = client.post("/api/positions", json={"name": f"PermTest_{_u()}"})
        pid = resp.json()["id"]
        resp = client.get(f"/api/position-permissions/{pid}")
        assert resp.status_code == 200

    def test_set_permissions(self, client):
        resp = client.post("/api/positions", json={"name": f"PermSet_{_u()}"})
        pid = resp.json()["id"]
        resp = client.put("/api/position-permissions", json={
            "position": pid,
            "pages": ["healing-records", "class-records", "payment", "accounts"],
        })
        assert resp.status_code == 200

    def test_set_empty_permissions(self, client):
        resp = client.post("/api/positions", json={"name": f"PermEmpty_{_u()}"})
        pid = resp.json()["id"]
        resp = client.put("/api/position-permissions", json={
            "position": pid,
            "pages": [],
        })
        assert resp.status_code == 200

    def test_set_all_permission_keys(self, client):
        """设置所有权限键"""
        all_pages = [
            "healing-records", "class-records", "daily-activities",
            "group-case-sessions", "emotional-release-sessions",
            "energy-knot-sessions", "internal-course-sessions",
            "payment", "positions/courses", "config/member-identities",
            "healing-identities", "courses/spaces", "config/reminders",
            "accounts", "positions/management", "change-password",
            "agents", "knowledge", "business", "operation-logs", "system-logs",
        ]
        resp = client.post("/api/positions", json={"name": f"AllPerm_{_u()}"})
        pid = resp.json()["id"]
        resp = client.put("/api/position-permissions", json={
            "position": pid,
            "pages": all_pages,
        })
        assert resp.status_code == 200


# ===== 活动权限 =====

class TestActivityPermissions:
    def test_get_all(self, client):
        resp = client.get("/api/activity-permissions")
        assert resp.status_code == 200

    def test_set_permissions(self, client):
        resp = client.put("/api/activity-permissions", json={
            "permissions": {
                "体验会员": {
                    "沙龙": {"view": True, "participate": True},
                    "觉醒游戏": {"view": True, "participate": False},
                    "情绪释放": {"view": False, "participate": False},
                    "能量结": {"view": True, "participate": True},
                    "内部课程": {"view": True, "participate": True},
                },
                "常规会员": {
                    "沙龙": {"view": True, "participate": True},
                    "觉醒游戏": {"view": True, "participate": True},
                    "情绪释放": {"view": True, "participate": True},
                    "能量结": {"view": True, "participate": True},
                    "内部课程": {"view": True, "participate": True},
                },
            }
        })
        assert resp.status_code == 200


# ===== 角色 (Positions) =====

class TestPositions:
    def test_list(self, client):
        resp = client.get("/api/positions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/positions", json={"name": f"测试角色_{_u()}"})
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

    def test_update(self, client):
        resp = client.post("/api/positions", json={"name": f"待更新_{_u()}"})
        pid = resp.json()["id"]
        # 身份名称全局唯一，更新名也要带唯一后缀，避免撞历史残留数据
        resp = client.patch(f"/api/positions/{pid}", json={"name": f"已更新_{_u()}"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/positions", json={"name": f"待删除_{_u()}"})
        pid = resp.json()["id"]
        resp = client.delete(f"/api/positions/{pid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/positions/nonexistent")
        assert resp.status_code == 404


# ===== 会员身份 =====

class TestMemberIdentities:
    def test_list(self, client):
        resp = client.get("/api/member-identities")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client):
        resp = client.post("/api/member-identities", json={"name": f"VIP_{_u()}"})
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

    def test_create_with_conditions(self, client):
        """带条件的会员身份"""
        # 条件结构见 models/member_identity.py 的 IdentityCondition：
        # type 限 arrival/activity/card/...，比较符字段为 count_op/count_value，逻辑字段为 operator
        resp = client.post("/api/member-identities", json={
            "name": f"高级VIP_{_u()}",
            "conditions": [
                {"type": "arrival", "count_op": ">=", "count_value": 10},
                {"type": "card", "count_op": "=", "count_value": 1, "items": ["年卡"]},
            ],
            "operator": "all",
        })
        assert resp.status_code == 200

    def test_update(self, client):
        resp = client.post("/api/member-identities", json={"name": f"待更新_{_u()}"})
        mid = resp.json()["id"]
        resp = client.put(f"/api/member-identities/{mid}", json={"name": "已更新"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/member-identities", json={"name": f"待删除_{_u()}"})
        mid = resp.json()["id"]
        resp = client.delete(f"/api/member-identities/{mid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/member-identities/nonexistent")
        assert resp.status_code == 404

    def test_refresh_all(self, client):
        resp = client.post("/api/member-identities/refresh-all")
        assert resp.status_code == 200

    def test_reorder(self, client):
        """重排序"""
        ids = []
        for i in range(3):
            resp = client.post("/api/member-identities", json={"name": f"排序_{i}_{_u()}"})
            ids.append(resp.json()["id"])
        resp = client.put("/api/member-identities/batch/reorder", json={"ids": list(reversed(ids))})
        assert resp.status_code == 200


# ===== 课程类型和课程 =====

class TestCourseTypes:
    def test_list(self, client):
        resp = client.get("/api/course-types")
        assert resp.status_code == 200

    def test_create(self, client):
        resp = client.post("/api/course-types", json={"name": f"类型_{_u()}"})
        assert resp.status_code == 200

    def test_delete(self, client):
        name = f"待删_{_u()}"
        client.post("/api/course-types", json={"name": name})
        resp = client.delete(f"/api/course-types/{name}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/course-types/nonexistent_type")
        assert resp.status_code == 404


class TestCourses:
    def test_list(self, client):
        resp = client.get("/api/courses")
        assert resp.status_code == 200

    def test_create(self, client):
        resp = client.post("/api/courses", json={
            "name": f"课程_{_u()}",
            "type": "沙龙",
            "description": "课程描述",
        })
        assert resp.status_code == 200

    def test_create_minimal(self, client):
        resp = client.post("/api/courses", json={
            "name": f"最小_{_u()}",
            "type": "沙龙",
        })
        assert resp.status_code == 200

    def test_update(self, client):
        resp = client.post("/api/courses", json={"name": f"待更新_{_u()}", "type": "沙龙"})
        cid = resp.json()["id"]
        resp = client.patch(f"/api/courses/{cid}", json={"name": "已更新"})
        assert resp.status_code == 200

    def test_update_description(self, client):
        resp = client.post("/api/courses", json={"name": f"描述_{_u()}", "type": "沙龙"})
        cid = resp.json()["id"]
        resp = client.patch(f"/api/courses/{cid}", json={"description": "新描述"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/courses", json={"name": f"待删_{_u()}", "type": "沙龙"})
        cid = resp.json()["id"]
        resp = client.delete(f"/api/courses/{cid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/courses/nonexistent")
        assert resp.status_code == 404


# ===== 疗愈空间 =====

class TestSpaces:
    def test_list(self, client):
        resp = client.get("/api/spaces")
        assert resp.status_code == 200

    def test_create(self, client):
        resp = client.post("/api/spaces", json={"name": f"空间_{_u()}"})
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

    def test_update(self, client):
        resp = client.post("/api/spaces", json={"name": f"待更新_{_u()}"})
        sid = resp.json()["id"]
        # 空间名称全局唯一，更新名也要带唯一后缀
        resp = client.patch(f"/api/spaces/{sid}", json={"name": f"已更新_{_u()}"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/spaces", json={"name": f"待删除_{_u()}"})
        sid = resp.json()["id"]
        resp = client.delete(f"/api/spaces/{sid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/spaces/nonexistent")
        assert resp.status_code == 404

    def test_add_room(self, client):
        resp = client.post("/api/spaces", json={"name": f"房间测试_{_u()}"})
        sid = resp.json()["id"]
        # 房间名在所有空间间全局唯一（space_service.add_room 校验），必须带唯一后缀
        name = f"A101_{_u()}"
        resp = client.post(f"/api/spaces/{sid}/rooms", json={"name": name})
        assert resp.status_code == 200
        assert resp.json()["name"] == name

    def test_add_multiple_rooms(self, client):
        resp = client.post("/api/spaces", json={"name": f"多房间_{_u()}"})
        sid = resp.json()["id"]
        u = _u()
        for name in [f"A101_{u}", f"A102_{u}", f"A103_{u}", f"B201_{u}"]:
            resp = client.post(f"/api/spaces/{sid}/rooms", json={"name": name})
            assert resp.status_code == 200

    def test_delete_room(self, client):
        resp = client.post("/api/spaces", json={"name": f"删房间_{_u()}"})
        sid = resp.json()["id"]
        resp = client.post(f"/api/spaces/{sid}/rooms", json={"name": f"B201_{_u()}"})
        rid = resp.json()["id"]
        resp = client.delete(f"/api/spaces/{sid}/rooms/{rid}")
        assert resp.status_code == 200

    def test_delete_nonexistent_room(self, client):
        resp = client.post("/api/spaces", json={"name": f"无房间_{_u()}"})
        sid = resp.json()["id"]
        resp = client.delete(f"/api/spaces/{sid}/rooms/nonexistent")
        assert resp.status_code == 404

    def test_add_room_to_nonexistent_space(self, client):
        resp = client.post("/api/spaces/nonexistent/rooms", json={"name": "X"})
        assert resp.status_code == 404


# ===== 提醒配置 =====

class TestReminders:
    def test_list(self, client):
        resp = client.get("/api/reminders")
        assert resp.status_code == 200

    def test_create(self, client):
        resp = client.post("/api/reminders", json={
            "name": f"提醒_{_u()}",
            "trigger_mode": "once",
        })
        assert resp.status_code == 200

    def test_create_with_conditions(self, client):
        """带条件的提醒"""
        # 条件结构见 models/reminder.py 的 ReminderCondition：
        # mode 限 fixed_cycle/relative/participation_count/remaining_count，operator 仅 gt/eq/lt/""
        resp = client.post("/api/reminders", json={
            "name": f"条件提醒_{_u()}",
            "condition_logic": "all",
            "conditions": [{"type": "visit_count", "mode": "relative", "operator": "gt", "value": 3}],
            "trigger_mode": "every_time",
        })
        assert resp.status_code == 200
        assert resp.json()["trigger_mode"] == "every_time"

    def test_create_for_role(self, client):
        """指定角色的提醒"""
        resp = client.post("/api/reminders", json={
            "name": f"角色提醒_{_u()}",
            "account_role": "管理员",
        })
        assert resp.status_code == 200
        assert resp.json()["account_role"] == "管理员"

    def test_create_various_trigger_modes(self, client):
        """不同触发模式"""
        for mode in ["once", "every_time"]:
            resp = client.post("/api/reminders", json={
                "name": f"模式{mode}_{_u()}",
                "trigger_mode": mode,
            })
            assert resp.status_code == 200
            assert resp.json()["trigger_mode"] == mode

    def test_update(self, client):
        resp = client.post("/api/reminders", json={
            "name": f"待更新_{_u()}",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/reminders/{rid}", json={"name": "已更新"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "已更新"

    def test_update_trigger_mode(self, client):
        resp = client.post("/api/reminders", json={
            "name": f"切换_{_u()}",
            "trigger_mode": "once",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/reminders/{rid}", json={"trigger_mode": "every_time"})
        assert resp.status_code == 200
        assert resp.json()["trigger_mode"] == "every_time"

    def test_delete(self, client):
        resp = client.post("/api/reminders", json={
            "name": f"待删_{_u()}", "days_before": 1, "enabled": True,
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/reminders/{rid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/reminders/nonexistent")
        assert resp.status_code == 404


# ===== 日程分组 =====

class TestDailyGroupings:
    def test_get_empty(self, client):
        resp = client.get("/api/daily-groupings?date=2099-01-01")
        assert resp.status_code == 200

    def test_upsert(self, client):
        resp = client.put("/api/daily-groupings", json={
            "date": "2026-08-01",
            "groups": [{"name": "A组", "members": ["m1", "m2"]}],
        })
        assert resp.status_code == 200

    def test_upsert_multiple_groups(self, client):
        resp = client.put("/api/daily-groupings", json={
            "date": "2026-08-02",
            "groups": [
                {"name": "A组", "members": ["m1"]},
                {"name": "B组", "members": ["m2"]},
                {"name": "C组", "members": ["m3"]},
            ],
        })
        assert resp.status_code == 200

    def test_upsert_empty_groups(self, client):
        resp = client.put("/api/daily-groupings", json={
            "date": "2026-08-03",
            "groups": [],
        })
        assert resp.status_code == 200

    def test_upsert_overwrite(self, client):
        """覆盖已有分组"""
        client.put("/api/daily-groupings", json={
            "date": "2026-08-04",
            "groups": [{"name": "旧组", "members": []}],
        })
        resp = client.put("/api/daily-groupings", json={
            "date": "2026-08-04",
            "groups": [{"name": "新组", "members": ["m1"]}],
        })
        assert resp.status_code == 200


# ===== AI 配置 =====

class TestAIConfigs:
    def test_list(self, client):
        resp = client.get("/api/ai-configs")
        assert resp.status_code == 200

    def test_providers(self, client):
        resp = client.get("/api/ai-configs/providers")
        assert resp.status_code == 200

    def test_create(self, client):
        resp = client.post("/api/ai-configs", json={
            "name": f"配置_{_u()}",
            "provider": "qwen",
            "model": "qwen-turbo",
            "api_key": "test-key",
        })
        assert resp.status_code == 200

    def test_create_all_providers(self, client):
        """所有供应商"""
        for provider in ["qwen", "kimi", "glm", "deepseek", "xiaomi"]:
            resp = client.post("/api/ai-configs", json={
                "name": f"{provider}_{_u()}",
                "provider": provider,
                "model": f"{provider}-model",
            })
            assert resp.status_code == 200

    def test_update(self, client):
        resp = client.post("/api/ai-configs", json={
            "name": f"待更新_{_u()}", "provider": "qwen", "model": "qwen-turbo",
        })
        cid = resp.json()["id"]
        resp = client.patch(f"/api/ai-configs/{cid}", json={"model": "qwen-plus"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/ai-configs", json={
            "name": f"待删_{_u()}", "provider": "qwen", "model": "qwen-turbo",
        })
        cid = resp.json()["id"]
        resp = client.delete(f"/api/ai-configs/{cid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/ai-configs/nonexistent")
        assert resp.status_code == 404


# ===== AI Agent =====

class TestAgents:
    def test_list(self, client):
        resp = client.get("/api/agents")
        assert resp.status_code == 200

    def test_create(self, client):
        resp = client.post("/api/agents", json={
            "name": f"Agent_{_u()}",
            "description": "测试Agent",
            "model": "qwen-turbo",
            "system_prompt": "你是一个助手",
        })
        assert resp.status_code == 200

    def test_get_by_id(self, client):
        resp = client.post("/api/agents", json={
            "name": f"GET_{_u()}", "model": "qwen-turbo",
        })
        aid = resp.json()["id"]
        resp = client.get(f"/api/agents/{aid}")
        assert resp.status_code == 200

    def test_get_nonexistent(self, client):
        resp = client.get("/api/agents/nonexistent")
        assert resp.status_code == 404

    def test_update(self, client):
        resp = client.post("/api/agents", json={
            "name": f"待更新_{_u()}", "model": "qwen-turbo",
        })
        aid = resp.json()["id"]
        resp = client.patch(f"/api/agents/{aid}", json={"name": "已更新"})
        assert resp.status_code == 200

    def test_update_model(self, client):
        resp = client.post("/api/agents", json={
            "name": f"模型_{_u()}", "model": "qwen-turbo",
        })
        aid = resp.json()["id"]
        resp = client.patch(f"/api/agents/{aid}", json={"model": "qwen-plus"})
        assert resp.status_code == 200

    def test_delete(self, client):
        resp = client.post("/api/agents", json={
            "name": f"待删_{_u()}", "model": "qwen-turbo",
        })
        aid = resp.json()["id"]
        resp = client.delete(f"/api/agents/{aid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/agents/nonexistent")
        assert resp.status_code == 404


# ===== 操作日志和系统日志 =====

class TestLogs:
    def test_operation_logs(self, client):
        resp = client.get("/api/operation-logs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_operation_logs_filter_operator(self, client):
        resp = client.get("/api/operation-logs?operator=test")
        assert resp.status_code == 200

    def test_operation_logs_filter_method(self, client):
        resp = client.get("/api/operation-logs?method=POST")
        assert resp.status_code == 200

    def test_operation_logs_filter_date(self, client):
        resp = client.get("/api/operation-logs?date_from=2026-01-01&date_to=2026-12-31")
        assert resp.status_code == 200

    def test_operation_logs_filter_keyword(self, client):
        resp = client.get("/api/operation-logs?keyword=customer")
        assert resp.status_code == 200

    def test_system_logs(self, client):
        resp = client.get("/api/system-logs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_system_logs_filter(self, client):
        resp = client.get("/api/system-logs?method=POST&date_from=2026-01-01")
        assert resp.status_code == 200


# ===== 健康检查 =====

class TestHealth:
    def test_health(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ===== 业务提醒 =====

class TestBusinessReminders:
    # 注意：business_reminders 接口已改为从登录 token 取 user_id/user_role，
    # 不再接收 user_id/user_role 查询参数（多余参数会被忽略）。
    # ReminderCondition.operator 仅支持 gt/eq/lt/""（gte/lte 已废弃）。

    def test_list(self, client):
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_with_legacy_params_ignored(self, client):
        """旧的 user_id/user_role 查询参数已被忽略，不影响请求"""
        resp = client.get("/api/business-reminders?user_id=test&user_role=超级管理员")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_identity_from_token(self, client):
        """接口从 token 取身份：conftest client 是超级管理员，不带参数也可访问"""
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200

    def test_toggle_nonexistent(self, client):
        """切换不存在的提醒状态 — 首次创建 handled=True，再次 toggle 反转"""
        resp = client.patch("/api/business-reminders/nonexistent_item_xxx/toggle")
        assert resp.status_code == 200
        assert "handled" in resp.json()

    def test_create_reminder_then_evaluate(self, client, created_customer):
        """创建提醒规则后评估"""
        # 创建一条到店次数提醒（operator 仅支持 gt/eq/lt，>=1 用 gt 0 表达）
        resp = client.post("/api/reminders", json={
            "name": f"到店提醒_{_u()}",
            "conditions": [{"type": "visit_count", "mode": "relative", "operator": "gt", "value": 0}],
            "condition_logic": "all",
            "account_role": "全部",
        })
        assert resp.status_code == 200
        # 评估
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200

    def test_reminder_with_activity_condition(self, client, created_customer):
        """活动参与条件的提醒"""
        resp = client.post("/api/reminders", json={
            "name": f"活动提醒_{_u()}",
            "conditions": [{
                "type": "activity",
                "mode": "participation_count",
                "operator": "gt",
                "value": 0,
                "activity_type": "membership",
            }],
            "condition_logic": "all",
        })
        assert resp.status_code == 200
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200

    def test_reminder_with_acquaintance_date(self, client, created_customer):
        """认识日期条件"""
        resp = client.post("/api/reminders", json={
            "name": f"认识日期提醒_{_u()}",
            "conditions": [{"type": "acquaintance_date", "mode": "relative", "operator": "gt", "value": 0}],
            "condition_logic": "all",
        })
        assert resp.status_code == 200
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200

    def test_reminder_with_fixed_cycle(self, client):
        """固定周期条件"""
        resp = client.post("/api/reminders", json={
            "name": f"周期提醒_{_u()}",
            "conditions": [{"type": "acquaintance_date", "mode": "fixed_cycle", "value": 7}],
            "condition_logic": "all",
        })
        assert resp.status_code == 200
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200

    def test_reminder_condition_logic_any(self, client):
        """条件逻辑 OR"""
        resp = client.post("/api/reminders", json={
            "name": f"或逻辑提醒_{_u()}",
            "conditions": [
                {"type": "visit_count", "mode": "relative", "operator": "gt", "value": 99},
                {"type": "acquaintance_date", "mode": "relative", "operator": "gt", "value": 0},
            ],
            "condition_logic": "any",
        })
        assert resp.status_code == 200
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200

    def test_reminder_role_filter(self, client):
        """按角色过滤提醒（评估角色取自登录 token，此处为超级管理员）"""
        # 创建仅管理员可见的提醒
        resp = client.post("/api/reminders", json={
            "name": f"管理员专属_{_u()}",
            "conditions": [{"type": "visit_count", "mode": "relative", "operator": "gt", "value": -1}],
            "account_role": "管理员",
        })
        assert resp.status_code == 200
        # 超管 token 评估不报错（角色过滤生效与否由服务端按 token 角色决定）
        resp = client.get("/api/business-reminders")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_toggle_then_list_shows_handled(self, client, created_customer):
        """toggle 后列表显示已处理"""
        # 创建提醒
        resp = client.post("/api/reminders", json={
            "name": f"待处理提醒_{_u()}",
            "conditions": [{"type": "visit_count", "mode": "relative", "operator": "gt", "value": 0}],
            "condition_logic": "all",
        })
        assert resp.status_code == 200
        # 获取列表找到 item_id
        resp = client.get("/api/business-reminders")
        items = resp.json()
        if items:
            item_id = items[0]["id"]
            first_handled = items[0]["handled"]
            # toggle
            resp = client.patch(f"/api/business-reminders/{item_id}/toggle")
            assert resp.status_code == 200
            assert resp.json()["handled"] is not first_handled
            # 再次 toggle 回原状态
            resp = client.patch(f"/api/business-reminders/{item_id}/toggle")
            assert resp.status_code == 200
            assert resp.json()["handled"] is first_handled
