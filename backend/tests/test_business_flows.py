"""业务流程测试 — 跨模块联动、扣费逻辑、身份刷新、权限验证"""
import pytest
import uuid


def _u(suffix=""):
    return f"{uuid.uuid4().hex[:12]}{suffix}"


# ===== 客户全生命周期 =====

class TestCustomerLifecycle:
    """客户从创建到参与活动的完整生命周期"""

    def test_create_customer_with_all_fields(self, client):
        """创建客户：所有字段都填写"""
        u = _u()
        resp = client.post("/api/customers", json={
            "nickname": f"完整客户_{u}",
            "name": "李四",
            "gender": "女",
            "phone": "13900001111",
            "wechat": f"wechat_{u}",
            "age": "28",
            "traffic_source": "小红书",
            "traffic_source_detail": "疗愈博主推荐",
            "referrer": "",
            "tags": "新客户,意向会员",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["nickname"] == f"完整客户_{u}"
        assert data["traffic_source"] == "小红书"
        assert data["tags"] == "新客户,意向会员"

    def test_customer_traffic_source_types(self, client):
        """验证所有流量来源类型都能保存"""
        sources = ["小红书", "抖音", "公众号", "视频号", "好友推荐", "朋友圈", "美团", "其他"]
        for source in sources:
            u = _u()
            resp = client.post("/api/customers", json={
                "nickname": f"来源测试_{u}",
                "traffic_source": source,
            })
            assert resp.status_code == 200
            assert resp.json()["traffic_source"] == source

    def test_customer_detail_aggregation(self, client, created_customer):
        """客户详情：聚合数据包含所有子模块"""
        cid = created_customer["id"]
        resp = client.get(f"/api/customer-detail/{cid}")
        assert resp.status_code == 200
        data = resp.json()
        # 必须包含这些字段
        assert "customer" in data
        assert "visit_records" in data
        assert "healing_records" in data
        assert "payment_records" in data
        assert "purchase_summary" in data
        assert "activities" in data
        assert data["customer"]["id"] == cid

    def test_customer_detail_nonexistent(self, client):
        """不存在的客户返回 404"""
        resp = client.get("/api/customer-detail/nonexistent-id")
        assert resp.status_code == 404

    def test_customer_delete_cascade_check(self, client, created_customer):
        """删除客户后，详情接口应返回 404"""
        cid = created_customer["id"]
        resp = client.delete(f"/api/customers/{cid}")
        assert resp.status_code == 200
        resp = client.get(f"/api/customer-detail/{cid}")
        assert resp.status_code == 404


# ===== 到访记录业务逻辑 =====

class TestVisitBusinessLogic:
    """到访记录的业务规则"""

    def test_create_visit_sets_arrival(self, client, created_customer):
        """创建到访记录并设置到店状态"""
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-27",
            "visit_time": "10:00",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "arrived": True,
            "arrival_time": "10:05",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["arrived"] is True
        assert data["arrival_time"] == "10:05"

    def test_visit_with_feedback_fields(self, client, created_customer):
        """到访记录：体验和反馈字段"""
        resp = client.post("/api/visits", json={
            "visit_date": "2026-05-28",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "needs": "想体验情绪释放",
            "experience": "感觉很放松",
            "feedback": "感谢您的反馈",
            "healing_notes": "肩颈有改善",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["needs"] == "想体验情绪释放"
        assert data["experience"] == "感觉很放松"
        assert data["feedback"] == "感谢您的反馈"
        assert data["healing_notes"] == "肩颈有改善"

    def test_visit_search_customers(self, client, created_customer):
        """到访记录：搜索客户"""
        resp = client.get(f"/api/visits/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) >= 1
        assert any(r["id"] == created_customer["id"] for r in results)

    def test_visit_list_by_customer(self, client, created_customer):
        """按客户 ID 筛选到访记录"""
        # 创建两条记录
        for date in ["2026-06-01", "2026-06-02"]:
            client.post("/api/visits", json={
                "visit_date": date,
                "customer_id": created_customer["id"],
                "nickname": created_customer["nickname"],
            })
        resp = client.get(f"/api/visits?customer_id={created_customer['id']}")
        assert resp.status_code == 200
        records = [v for v in resp.json() if v["customer_id"] == created_customer["id"]]
        assert len(records) >= 2

    def test_visit_statistics_populated(self, client, created_customer):
        """到访记录列表：统计数据已填充"""
        client.post("/api/visits", json={
            "visit_date": "2026-06-03",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        resp = client.get("/api/visits")
        assert resp.status_code == 200
        visit = next((v for v in resp.json() if v["customer_id"] == created_customer["id"]), None)
        assert visit is not None
        assert "visit_count" in visit
        assert "activity_count" in visit
        assert "welfare_count" in visit
        assert "remaining_count" in visit
        assert "activities" in visit


# ===== 付费项目完整流程 =====

class TestPaymentFlows:
    """付费项目的完整业务流程"""

    def test_membership_card_full_flow(self, client, created_customer):
        """会员卡：创建 → 查询 → 更新 → 删除"""
        cid = created_customer["id"]

        # 创建
        resp = client.post("/api/membership-cards", json={
            "customer_id": cid,
            "nickname": created_customer["nickname"],
            "card_type": "常规通卡",
            "price": 3999.0,
            "effective_date": "2026-05-01",
            "remaining_count": 20,
        })
        assert resp.status_code == 200
        card_id = resp.json()["id"]
        assert resp.json()["remaining_count"] == 20

        # 查询
        resp = client.get("/api/membership-cards")
        assert resp.status_code == 200
        assert any(c["id"] == card_id for c in resp.json())

        # 更新剩余次数：流水派生后禁止直接 PATCH 修改次数
        resp = client.patch(f"/api/membership-cards/{card_id}", json={"remaining_count": 15})
        assert resp.status_code == 400

        # 删除
        resp = client.delete(f"/api/membership-cards/{card_id}")
        assert resp.status_code == 200

    def test_membership_card_types_pricing(self, client, created_customer):
        """验证不同卡类型的价格和属性"""
        card_types = [
            {"card_type": "体验会员", "price": 399.0},
            {"card_type": "常规通卡", "price": 3999.0},
            {"card_type": "半年卡", "price": 5999.0},
            {"card_type": "年卡", "price": 9999.0},
        ]
        for ct in card_types:
            resp = client.post("/api/membership-cards", json={
                "customer_id": created_customer["id"],
                "nickname": created_customer["nickname"],
                "card_type": ct["card_type"],
                "price": ct["price"],
                "effective_date": "2026-05-01",
            })
            assert resp.status_code == 200
            assert resp.json()["card_type"] == ct["card_type"]
            assert resp.json()["price"] == ct["price"]

    def test_group_case_purchase_flow(self, client, created_customer):
        """觉醒游戏：购买记录完整流程"""
        cid = created_customer["id"]

        # 创建购买记录
        resp = client.post("/api/group-cases", json={
            "customer_id": cid,
            "nickname": created_customer["nickname"],
            "purchase_count": 5,
            "amount": 1999.0,
        })
        assert resp.status_code == 200
        case_id = resp.json()["id"]
        assert resp.json()["purchase_count"] == 5

        # 更新：purchase_count 由活动扣减流水派生，禁止直接 PATCH 修改
        resp = client.patch(f"/api/group-cases/{case_id}", json={"purchase_count": 3})
        assert resp.status_code == 400

        # 删除
        resp = client.delete(f"/api/group-cases/{case_id}")
        assert resp.status_code == 200

    def test_emotional_release_purchase_flow(self, client, created_customer):
        """情绪释放：购买记录完整流程"""
        cid = created_customer["id"]
        resp = client.post("/api/emotional-releases", json={
            "customer_id": cid,
            "nickname": created_customer["nickname"],
            "purchase_count": 10,
            "amount": 2999.0,
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/emotional-releases/{rid}")
        assert resp.status_code == 200

    def test_energy_knot_purchase_flow(self, client, created_customer):
        """能量结：购买记录完整流程"""
        cid = created_customer["id"]
        resp = client.post("/api/energy-knots", json={
            "customer_id": cid,
            "nickname": created_customer["nickname"],
            "purchase_count": 3,
            "amount": 999.0,
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/energy-knots/{rid}")
        assert resp.status_code == 200

    def test_internal_course_purchase_flow(self, client, created_customer):
        """内部课程：购买记录完整流程"""
        cid = created_customer["id"]
        resp = client.post("/api/internal-courses", json={
            "customer_id": cid,
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]
        resp = client.delete(f"/api/internal-courses/{rid}")
        assert resp.status_code == 200

    def test_payment_search_customers(self, client, created_customer):
        """付费项目：搜索客户功能"""
        endpoints = [
            "/api/membership-cards/search-customers",
            "/api/group-cases/search-customers",
            "/api/emotional-releases/search-customers",
            "/api/energy-knots/search-customers",
            "/api/internal-courses/search-customers",
        ]
        for ep in endpoints:
            resp = client.get(f"{ep}?q={created_customer['nickname']}")
            assert resp.status_code == 200, f"{ep} 搜索失败"


# ===== 活动管理完整流程 =====

class TestActivityFlows:
    """活动管理的完整业务流程"""

    def test_class_record_full_flow(self, client, created_customer):
        """沙龙记录：创建 → 添加参与人 → 分组 → 更新 → 删除"""
        # 创建
        resp = client.post("/api/class-records", json={
            "date": "2026-06-10",
            "course_id": "course-001",
            "course_name": "晨间疗愈沙龙",
            "start_time": "09:00",
            "end_time": "11:00",
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]

        # 添加参与人
        resp = client.patch(f"/api/class-records/{rid}/participants", json={
            "participant_ids": [created_customer["id"]],
        })
        assert resp.status_code == 200

        # 分组
        resp = client.patch(f"/api/class-records/{rid}/groups", json={
            "groups": [
                {
                    "name": "A组",
                    "leader_id": created_customer["id"],
                    "deputy_id": "",
                    "member_ids": [],
                }
            ],
        })
        assert resp.status_code == 200

        # 更新课程名
        resp = client.patch(f"/api/class-records/{rid}", json={
            "course_name": "更新后的沙龙",
        })
        assert resp.status_code == 200
        assert resp.json()["course_name"] == "更新后的沙龙"

        # 删除
        resp = client.delete(f"/api/class-records/{rid}")
        assert resp.status_code == 200

    def test_class_record_filter_by_date(self, client):
        """沙龙记录：按日期筛选"""
        # 创建不同日期的记录
        for date in ["2026-07-01", "2026-07-02"]:
            client.post("/api/class-records", json={
                "date": date,
                "course_id": "c1",
                "course_name": f"沙龙_{date}",
            })
        resp = client.get("/api/class-records?date=2026-07-01")
        assert resp.status_code == 200
        for r in resp.json():
            assert r["date"] == "2026-07-01"

    def test_group_case_session_full_flow(self, client, created_customer):
        """觉醒游戏场次：创建 → 更新 → 删除"""
        resp = client.post("/api/group-case-sessions", json={
            "date": "2026-06-10",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
            "description": "测试场次",
        })
        assert resp.status_code == 200
        sid = resp.json()["id"]

        resp = client.patch(f"/api/group-case-sessions/{sid}", json={
            "description": "已更新场次",
        })
        assert resp.status_code == 200

        resp = client.delete(f"/api/group-case-sessions/{sid}")
        assert resp.status_code == 200

    def test_emotional_release_session_flow(self, client, created_customer):
        """情绪释放场次：创建 → 更新 → 删除"""
        resp = client.post("/api/emotional-release-sessions", json={
            "date": "2026-06-10",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200
        sid = resp.json()["id"]
        resp = client.delete(f"/api/emotional-release-sessions/{sid}")
        assert resp.status_code == 200

    def test_energy_knot_session_flow(self, client, created_customer):
        """能量结场次：创建 → 更新 → 删除"""
        resp = client.post("/api/energy-knot-sessions", json={
            "date": "2026-06-10",
            "owner_id": created_customer["id"],
            "owner_name": created_customer["nickname"],
        })
        assert resp.status_code == 200
        sid = resp.json()["id"]
        resp = client.delete(f"/api/energy-knot-sessions/{sid}")
        assert resp.status_code == 200

    def test_internal_course_session_flow(self, client):
        """内部课程场次：创建 → 更新 → 删除"""
        resp = client.post("/api/internal-course-sessions", json={
            "date": "2026-06-10",
            "course_type": "疗愈师课程",
            "course_name": "基础疗愈入门",
        })
        assert resp.status_code == 200
        sid = resp.json()["id"]

        resp = client.patch(f"/api/internal-course-sessions/{sid}", json={
            "course_name": "更新后的课程",
        })
        assert resp.status_code == 200

        resp = client.delete(f"/api/internal-course-sessions/{sid}")
        assert resp.status_code == 200

    def test_activity_session_search_customers(self, client, created_customer):
        """活动场次：搜索客户功能"""
        endpoints = [
            "/api/class-records/search-customers",
            "/api/group-case-sessions/search-customers",
            "/api/emotional-release-sessions/search-customers",
            "/api/energy-knot-sessions/search-customers",
            "/api/internal-course-sessions/search-customers",
        ]
        for ep in endpoints:
            resp = client.get(f"{ep}?q={created_customer['nickname']}")
            assert resp.status_code == 200, f"{ep} 搜索失败"


# ===== 疗愈记录业务逻辑 =====

class TestHealingRecordFlows:
    """疗愈记录的业务流程"""

    def test_healing_record_full_flow(self, client, created_customer):
        """疗愈记录：创建 → 查询 → 更新 → 删除"""
        cid = created_customer["id"]

        # 创建
        resp = client.post("/api/healing-records", json={
            "customer_id": cid,
            "customer_name": created_customer["nickname"],
            "date": "2026-06-10",
            "title": "第一次疗愈",
            "teacher": "疗愈师A",
            "growth_record": "客户反馈良好",
            "materials": [{"id": "m1", "name": "记录表", "url": "/uploads/test.pdf"}],
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]

        # 按客户查询
        resp = client.get(f"/api/healing-records?customer_id={cid}")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        # 按客户+日期查询
        resp = client.get(f"/api/healing-records/by-customer-date?customer_id={cid}&date=2026-06-10")
        assert resp.status_code == 200
        assert resp.json()["id"] == rid

        # 更新
        resp = client.patch(f"/api/healing-records/{rid}", json={
            "title": "更新后的记录",
            "growth_record": "客户状态改善明显",
        })
        assert resp.status_code == 200
        assert resp.json()["title"] == "更新后的记录"

        # 删除
        resp = client.delete(f"/api/healing-records/{rid}")
        assert resp.status_code == 200

    def test_healing_record_search_customers(self, client, created_customer):
        """疗愈记录：搜索客户"""
        resp = client.get(f"/api/healing-records/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200


# ===== 权限系统完整流程 =====

class TestPermissionFlows:
    """权限系统的完整业务流程"""

    def test_role_page_permission_flow(self, client):
        """角色权限：创建角色 → 设置页面权限 → 查询"""
        # 创建角色
        resp = client.post("/api/positions", json={"name": "测试角色Perm"})
        assert resp.status_code == 200
        pid = resp.json()["id"]

        # 设置页面权限
        resp = client.put("/api/position-permissions", json={
            "position": pid,
            "pages": ["healing-records", "class-records", "payment"],
        })
        assert resp.status_code == 200

        # 查询权限
        resp = client.get(f"/api/position-permissions/{pid}")
        assert resp.status_code == 200

        # 查询所有权限
        resp = client.get("/api/position-permissions")
        assert resp.status_code == 200

        # 清理
        client.delete(f"/api/positions/{pid}")

    def test_account_login_with_permissions(self, client):
        """账号登录：验证返回权限信息"""
        u = _u()
        # 创建账号
        client.post("/api/accounts", json={
            "owner": f"perm_{u}",
            "role": "超级管理员",
            "username": f"perm_{u}",
            "password": "pass123",
            "enabled": True,
        })
        # 登录
        resp = client.post("/api/accounts/login", json={
            "username": f"perm_{u}",
            "password": "pass123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "permissions" in data
        assert "account" in data

    def test_role_crud_flow(self, client):
        """角色管理：创建 → 查询 → 更新 → 删除"""
        resp = client.post("/api/accounts/roles", json={
            "name": f"角色_{_u()}",
            "permissions": ["healing-records", "payment"],
        })
        assert resp.status_code == 200
        role_id = resp.json()["id"]

        resp = client.get("/api/accounts/roles")
        assert resp.status_code == 200

        resp = client.patch(f"/api/accounts/roles/{role_id}", json={
            "name": "更新后的角色",
        })
        assert resp.status_code == 200

        resp = client.delete(f"/api/accounts/roles/{role_id}")
        assert resp.status_code == 200

    def test_activity_permissions_flow(self, client):
        """活动权限：设置 → 查询"""
        resp = client.get("/api/activity-permissions")
        assert resp.status_code == 200

        resp = client.put("/api/activity-permissions", json={
            "permissions": {
                "会员": {
                    "沙龙": {"view": True, "participate": True},
                    "觉醒游戏": {"view": True, "participate": False},
                }
            }
        })
        assert resp.status_code == 200


# ===== 信息配置完整流程 =====

class TestConfigFlows:
    """信息配置模块的完整业务流程"""

    def test_course_type_and_course_flow(self, client):
        """沙龙类型：类型 CRUD → 课程 CRUD"""
        # 创建类型
        resp = client.post("/api/course-types", json={"name": "疗愈沙龙"})
        assert resp.status_code == 200

        # 创建课程
        resp = client.post("/api/courses", json={
            "name": "情绪管理入门",
            "type": "疗愈沙龙",
            "description": "基础情绪管理课程",
        })
        assert resp.status_code == 200
        cid = resp.json()["id"]

        # 更新课程
        resp = client.patch(f"/api/courses/{cid}", json={"name": "更新后的课程"})
        assert resp.status_code == 200

        # 删除课程
        resp = client.delete(f"/api/courses/{cid}")
        assert resp.status_code == 200

        # 删除类型
        resp = client.delete("/api/course-types/疗愈沙龙")
        assert resp.status_code == 200

    def test_space_and_room_flow(self, client):
        """疗愈空间：空间 CRUD → 房间 CRUD"""
        # 创建空间
        resp = client.post("/api/spaces", json={"name": "A栋疗愈区"})
        assert resp.status_code == 200
        sid = resp.json()["id"]

        # 添加房间
        resp = client.post(f"/api/spaces/{sid}/rooms", json={"name": "A101冥想室"})
        assert resp.status_code == 200
        rid = resp.json()["id"]

        # 删除房间
        resp = client.delete(f"/api/spaces/{sid}/rooms/{rid}")
        assert resp.status_code == 200

        # 删除空间
        resp = client.delete(f"/api/spaces/{sid}")
        assert resp.status_code == 200

    def test_member_identity_flow(self, client):
        """会员身份：CRUD + 刷新"""
        # 创建
        resp = client.post("/api/member-identities", json={"name": "VIP会员"})
        assert resp.status_code == 200
        mid = resp.json()["id"]

        # 更新
        resp = client.put(f"/api/member-identities/{mid}", json={"name": "SVIP会员"})
        assert resp.status_code == 200

        # 刷新所有身份
        resp = client.post("/api/member-identities/refresh-all")
        assert resp.status_code == 200

        # 删除
        resp = client.delete(f"/api/member-identities/{mid}")
        assert resp.status_code == 200

    def test_reminder_flow(self, client):
        """提醒配置：CRUD"""
        # 创建
        resp = client.post("/api/reminders", json={
            "name": "3天未到店提醒",
            "days_before": 3,
            "enabled": True,
        })
        assert resp.status_code == 200
        rid = resp.json()["id"]

        # 更新
        resp = client.patch(f"/api/reminders/{rid}", json={"days_before": 7})
        assert resp.status_code == 200

        # 删除
        resp = client.delete(f"/api/reminders/{rid}")
        assert resp.status_code == 200


# ===== 业务提醒 =====

class TestBusinessReminders:
    """业务提醒的触发和处理"""

    def test_business_reminders_list(self, client):
        """业务提醒：按用户查询"""
        resp = client.get("/api/business-reminders?user_id=test&user_role=超级管理员")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===== 日程分组 =====

class TestDailyGroupingFlows:
    """日程分组的业务流程"""

    def test_daily_grouping_upsert_and_get(self, client):
        """日程分组：创建/更新 → 查询"""
        # 创建
        resp = client.put("/api/daily-groupings", json={
            "date": "2026-06-15",
            "groups": [
                {"name": "A组", "members": ["member1", "member2"]},
                {"name": "B组", "members": ["member3"]},
            ],
        })
        assert resp.status_code == 200

        # 查询
        resp = client.get("/api/daily-groupings?date=2026-06-15")
        assert resp.status_code == 200

        # 更新（upsert）
        resp = client.put("/api/daily-groupings", json={
            "date": "2026-06-15",
            "groups": [
                {"name": "新A组", "members": ["member1", "member2", "member3"]},
            ],
        })
        assert resp.status_code == 200


# ===== 操作日志验证 =====

class TestOperationLogs:
    """操作日志是否正确记录"""

    def test_operation_log_recorded_on_create(self, client):
        """创建操作应产生操作日志"""
        # 先记录当前日志数量
        resp = client.get("/api/operation-logs")
        initial_count = len(resp.json())

        # 执行一个创建操作
        client.post("/api/spaces", json={"name": "日志测试空间"})

        # 检查日志是否增加
        resp = client.get("/api/operation-logs")
        new_count = len(resp.json())
        assert new_count > initial_count

    def test_operation_log_filter(self, client):
        """操作日志：按条件筛选"""
        resp = client.get("/api/operation-logs?method=POST")
        assert resp.status_code == 200
        for log in resp.json():
            assert log["method"] == "POST"

    def test_system_logs_exist(self, client):
        """系统日志：存在且可查询"""
        resp = client.get("/api/system-logs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===== AI 配置 =====

class TestAIFlows:
    """AI 配置模块"""

    def test_agent_crud_flow(self, client):
        """AI Agent：创建 → 查询 → 更新 → 删除"""
        # 创建
        resp = client.post("/api/agents", json={
            "name": "测试Agent",
            "description": "用于测试的AI助手",
            "model": "qwen-turbo",
            "system_prompt": "你是一个疗愈助手",
        })
        assert resp.status_code == 200
        aid = resp.json()["id"]

        # 查询单个
        resp = client.get(f"/api/agents/{aid}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "测试Agent"

        # 更新
        resp = client.patch(f"/api/agents/{aid}", json={"name": "更新后的Agent"})
        assert resp.status_code == 200

        # 删除
        resp = client.delete(f"/api/agents/{aid}")
        assert resp.status_code == 200

    def test_agent_list(self, client):
        """AI Agent：列表查询"""
        resp = client.get("/api/agents")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_ai_config_flow(self, client):
        """AI 配置：创建 → 查询 → 更新 → 删除"""
        resp = client.post("/api/ai-configs", json={
            "name": "测试AI配置",
            "provider": "qwen",
            "api_key": "test-key-123",
            "model": "qwen-turbo",
        })
        assert resp.status_code == 200
        cid = resp.json()["id"]

        resp = client.get("/api/ai-configs")
        assert resp.status_code == 200

        resp = client.patch(f"/api/ai-configs/{cid}", json={"model": "qwen-plus"})
        assert resp.status_code == 200

        resp = client.delete(f"/api/ai-configs/{cid}")
        assert resp.status_code == 200

    def test_ai_config_providers(self, client):
        """AI 配置：获取可用供应商列表"""
        resp = client.get("/api/ai-configs/providers")
        assert resp.status_code == 200


# ===== 健康检查 =====

class TestHealthCheck:
    """系统健康检查"""

    def test_health_endpoint(self, client):
        """健康检查接口正常返回"""
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ===== 边界情况和错误处理 =====

class TestEdgeCases:
    """边界情况和错误处理"""

    def test_invalid_id_returns_404(self, client):
        """无效 ID 应返回 404"""
        endpoints = [
            ("/api/customers/nonexistent", "GET"),
            ("/api/customers/nonexistent", "PATCH"),
            ("/api/customers/nonexistent", "DELETE"),
            ("/api/visits/nonexistent", "GET"),
            ("/api/healing-records/nonexistent", "GET"),
            ("/api/membership-cards/nonexistent", "PATCH"),
            ("/api/membership-cards/nonexistent", "DELETE"),
        ]
        for path, method in endpoints:
            if method == "GET":
                resp = client.get(path)
            elif method == "PATCH":
                resp = client.patch(path, json={"nickname": "x"})
            elif method == "DELETE":
                resp = client.delete(path)
            assert resp.status_code == 404, f"{method} {path} 应返回 404，实际 {resp.status_code}"

    def test_empty_search_returns_empty_list(self, client):
        """空搜索应返回空列表"""
        endpoints = [
            "/api/visits/search-customers?q=",
            "/api/class-records/search-customers?q=",
            "/api/healing-records/search-customers?q=",
            "/api/membership-cards/search-customers?q=",
        ]
        for ep in endpoints:
            resp = client.get(ep)
            assert resp.status_code == 200
            assert resp.json() == [], f"{ep} 空搜索应返回空列表"

    def test_nonexistent_search_returns_empty(self, client):
        """搜索不存在的关键词应返回空列表"""
        resp = client.get("/api/visits/search-customers?q=zzz_nonexistent_zzz")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_endpoints_return_list(self, client):
        """所有列表接口应返回数组"""
        list_endpoints = [
            "/api/customers",
            "/api/visits",
            "/api/class-records",
            "/api/group-cases",
            "/api/group-case-sessions",
            "/api/emotional-releases",
            "/api/emotional-release-sessions",
            "/api/energy-knots",
            "/api/energy-knot-sessions",
            "/api/internal-courses",
            "/api/internal-course-sessions",
            "/api/membership-cards",
            "/api/member-identities",
            "/api/healing-records",
            "/api/spaces",
            "/api/courses",
            "/api/course-types",
            "/api/reminders",
            "/api/accounts",
            "/api/positions",
            "/api/agents",
            "/api/ai-configs",
            "/api/operation-logs",
            "/api/system-logs",
        ]
        for ep in list_endpoints:
            resp = client.get(ep)
            assert resp.status_code == 200, f"GET {ep} 返回 {resp.status_code}"
            assert isinstance(resp.json(), list), f"GET {ep} 未返回列表"

    def test_soft_deleted_records_not_in_list(self, client, created_customer):
        """软删除的记录不应出现在列表中"""
        # 创建并删除一个到访记录
        resp = client.post("/api/visits", json={
            "visit_date": "2026-07-01",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]

        # 删除
        resp = client.delete(f"/api/visits/{vid}")
        assert resp.status_code == 200

        # 不应在列表中
        resp = client.get("/api/visits")
        assert not any(v["id"] == vid for v in resp.json())

        # 不应能直接获取
        resp = client.get(f"/api/visits/{vid}")
        assert resp.status_code == 404
