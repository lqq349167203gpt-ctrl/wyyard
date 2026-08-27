"""到访记录穷举测试 — 覆盖每个字段、每种筛选、每种业务规则"""
import uuid
from types import SimpleNamespace


def _u():
    return uuid.uuid4().hex[:12]


class TestVisitCreate:
    """到访记录创建：逐字段验证"""

    def _make(self, client, customer, **overrides):
        data = {
            "visit_date": "2026-08-01",
            "visit_time": "09:00",
            "customer_id": customer["id"],
            "nickname": customer["nickname"],
        }
        data.update(overrides)
        return client.post("/api/visits", json=data)

    def test_minimal_create(self, client, created_customer):
        """最小必填字段"""
        resp = self._make(client, created_customer)
        assert resp.status_code == 200
        data = resp.json()
        assert data["customer_id"] == created_customer["id"]
        assert data["visit_date"] == "2026-08-01"

    def test_visit_date_field(self, client, created_customer):
        """不同日期格式"""
        for date in ["2026-01-01", "2026-12-31", "2026-06-15"]:
            resp = self._make(client, created_customer, visit_date=date)
            assert resp.status_code == 200
            assert resp.json()["visit_date"] == date

    def test_visit_time_field(self, client, created_customer):
        """不同时间 — 每个时间用不同日期（同客户同日只能一条）"""
        for i, time in enumerate(["08:00", "12:30", "18:45", "23:59"]):
            resp = self._make(client, created_customer, visit_date=f"2026-07-{10+i:02d}", visit_time=time)
            assert resp.status_code == 200
            assert resp.json()["visit_time"] == time

    def test_arrived_true(self, client, created_customer):
        """设置已到店"""
        resp = self._make(client, created_customer, arrived=True, arrival_time="10:05")
        assert resp.status_code == 200
        assert resp.json()["arrived"] is True
        assert resp.json()["arrival_time"] == "10:05"

    def test_arrived_false_default(self, client, created_customer):
        """默认未到店"""
        resp = self._make(client, created_customer)
        assert resp.json()["arrived"] is False
        assert resp.json()["cancelled"] is False

    def test_needs_field(self, client, created_customer):
        """来访需求"""
        resp = self._make(client, created_customer, needs="想体验情绪释放")
        assert resp.status_code == 200
        assert resp.json()["needs"] == "想体验情绪释放"

    def test_experience_field(self, client, created_customer):
        """活动体验"""
        resp = self._make(client, created_customer, experience="感觉很放松")
        assert resp.status_code == 200
        assert resp.json()["experience"] == "感觉很放松"

    def test_feedback_field(self, client, created_customer):
        """客户反馈"""
        resp = self._make(client, created_customer, feedback="感谢反馈")
        assert resp.status_code == 200
        assert resp.json()["feedback"] == "感谢反馈"

    def test_healing_notes_field(self, client, created_customer):
        """疗愈记录"""
        resp = self._make(client, created_customer, healing_notes="肩颈改善")
        assert resp.status_code == 200
        assert resp.json()["healing_notes"] == "肩颈改善"

    def test_member_type_field(self, client, created_customer):
        """会员类型 — 后端自动从客户获取，不使用传入值"""
        resp = self._make(client, created_customer, member_type="体验会员")
        assert resp.status_code == 200
        assert "member_type" in resp.json()

    def test_daily_card_usage(self, client, created_customer):
        """每日用卡次数"""
        resp = self._make(client, created_customer, daily_card_usage=2)
        assert resp.status_code == 200
        assert resp.json()["daily_card_usage"] == 2

    def test_all_fields_together(self, client, created_customer):
        """所有字段一起填写"""
        resp = self._make(client, created_customer,
            visit_time="10:30",
            arrived=True,
            arrival_time="10:35",
            needs="全面体验",
            experience="非常好",
            feedback="会再来",
            healing_notes="整体改善",
            member_type="常规会员",
            daily_card_usage=1,
            activity_participation=[{"name": "沙龙", "role": "组员", "participated": True}],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["needs"] == "全面体验"
        assert data["experience"] == "非常好"
        assert data["feedback"] == "会再来"
        assert data["arrived"] is True


class TestVisitUpdate:
    """到访记录更新"""

    def _create(self, client, customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-08-02",
            "customer_id": customer["id"],
            "nickname": customer["nickname"],
        })
        return resp.json()["id"]

    def test_update_needs(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={"needs": "更新需求"})
        assert resp.status_code == 200
        assert resp.json()["needs"] == "更新需求"

    def test_update_experience(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={"experience": "更新体验"})
        assert resp.status_code == 200
        assert resp.json()["experience"] == "更新体验"

    def test_update_feedback(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={"feedback": "更新反馈"})
        assert resp.status_code == 200
        assert resp.json()["feedback"].endswith("不闹：更新反馈")

    def test_update_healing_notes(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={"healing_notes": "更新疗愈"})
        assert resp.status_code == 200
        assert resp.json()["healing_notes"].endswith("不闹：更新疗愈")

    def test_update_arrived(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={"arrived": True, "arrival_time": "14:00"})
        assert resp.status_code == 200
        assert resp.json()["arrived"] is True

    def test_cancel_unarrived_visit_and_persist(self, client, created_customer):
        """未到店邀约可取消，完整列表和轻量列表都持久返回取消状态"""
        vid = self._create(client, created_customer)

        resp = client.patch(f"/api/visits/{vid}", json={"cancelled": True})
        assert resp.status_code == 200
        assert resp.json()["cancelled"] is True
        assert resp.json()["arrived"] is False
        assert resp.json()["arrival_time"] == ""

        detail = client.get(f"/api/visits/{vid}")
        assert detail.status_code == 200
        assert detail.json()["cancelled"] is True

        light = client.get("/api/visits/light", params={"date": "2026-08-02"})
        assert light.status_code == 200
        item = next(row for row in light.json() if row["id"] == vid)
        assert item["cancelled"] is True

    def test_cancelled_visit_is_locked_until_restored(self, client, created_customer):
        """已取消记录不可修改或勾选到店，恢复后才可继续编辑"""
        vid = self._create(client, created_customer)
        assert client.patch(f"/api/visits/{vid}", json={"cancelled": True}).status_code == 200

        edit = client.patch(f"/api/visits/{vid}", json={"needs": "不应保存"})
        assert edit.status_code == 400
        assert "已锁定" in edit.json()["detail"]

        arrival = client.patch(
            f"/api/visits/{vid}",
            json={"arrived": True, "arrival_time": "14:00"},
        )
        assert arrival.status_code == 400
        assert client.get(f"/api/visits/{vid}").json()["arrived"] is False

        restored = client.patch(f"/api/visits/{vid}", json={"cancelled": False})
        assert restored.status_code == 200
        assert restored.json()["cancelled"] is False

        edited = client.patch(f"/api/visits/{vid}", json={"needs": "恢复后可编辑"})
        assert edited.status_code == 200
        assert edited.json()["needs"] == "恢复后可编辑"

    def test_arrived_visit_cannot_be_cancelled(self, client, created_customer):
        """已到店记录不显示取消入口，后端也拒绝取消"""
        vid = self._create(client, created_customer)
        assert client.patch(
            f"/api/visits/{vid}",
            json={"arrived": True, "arrival_time": "14:00"},
        ).status_code == 200

        resp = client.patch(f"/api/visits/{vid}", json={"cancelled": True})
        assert resp.status_code == 400
        assert "已到店" in resp.json()["detail"]

    def test_cancelled_visit_is_excluded_from_expected_count(self, client, created_customer):
        """取消后不再计入预计到场人数"""
        vid = self._create(client, created_customer)
        before = client.get(
            "/api/visits/counts",
            params={
                "customer_ids": created_customer["id"],
                "start_date": "2026-08-02",
                "end_date": "2026-08-02",
            },
        )
        assert before.status_code == 200
        assert before.json()["2026-08-02"] == 1

        assert client.patch(f"/api/visits/{vid}", json={"cancelled": True}).status_code == 200
        after = client.get(
            "/api/visits/counts",
            params={
                "customer_ids": created_customer["id"],
                "start_date": "2026-08-02",
                "end_date": "2026-08-02",
            },
        )
        assert after.status_code == 200
        assert after.json().get("2026-08-02", 0) == 0

    def test_update_visit_date(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={"visit_date": "2026-08-10"})
        assert resp.status_code == 200
        assert resp.json()["visit_date"] == "2026-08-10"

    def test_update_visit_time(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={"visit_time": "15:30"})
        assert resp.status_code == 200
        assert resp.json()["visit_time"] == "15:30"

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/visits/nonexistent", json={"needs": "x"})
        assert resp.status_code == 404

    def test_update_multiple_fields(self, client, created_customer):
        vid = self._create(client, created_customer)
        resp = client.patch(f"/api/visits/{vid}", json={
            "needs": "新需求",
            "experience": "新体验",
            "feedback": "新反馈",
            "healing_notes": "新记录",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["needs"] == "新需求"
        assert data["experience"] == "新体验"
        assert data["feedback"].endswith("不闹：新反馈")
        assert data["healing_notes"].endswith("不闹：新记录")


class TestVisitArrivalSyncPerformance:
    """到店扣卡只处理当天活动，并且只持久化当前客户。"""

    def test_arrival_and_restore_are_scoped_to_date_and_customer(self, monkeypatch):
        from app.services import (
            class_record_service,
            emotional_release_session_service,
            group_case_session_service,
            membership_card_service,
            visit_service,
        )

        customer_id = "customer-performance"
        activity_date = "2026-08-24"
        session = SimpleNamespace(id="session-1")
        class_record = SimpleNamespace(id="class-1", is_public_welfare=False)
        queried_dates = []
        synced = []
        saved_customers = []

        monkeypatch.setattr(
            group_case_session_service,
            "list_sessions",
            lambda date=None: queried_dates.append(("gcs", date)) or [session],
        )
        monkeypatch.setattr(
            emotional_release_session_service,
            "list_sessions",
            lambda date=None: queried_dates.append(("ers", date)) or [session],
        )
        monkeypatch.setattr(
            class_record_service,
            "list_records",
            lambda date=None: queried_dates.append(("class", date)) or [class_record],
        )
        monkeypatch.setattr(group_case_session_service, "_get_chargeable_ids", lambda _: {customer_id})
        monkeypatch.setattr(emotional_release_session_service, "_get_chargeable_ids", lambda _: {customer_id})
        monkeypatch.setattr(class_record_service, "_get_group_member_ids", lambda _: {customer_id})
        monkeypatch.setattr(membership_card_service, "get_activity_deduction_count", lambda _: 2)
        monkeypatch.setattr(
            membership_card_service,
            "_do_sync_activity_count",
            lambda cid, key, count: synced.append((cid, key, count)),
        )
        monkeypatch.setattr(
            membership_card_service,
            "_save_customer_usage",
            lambda cid: saved_customers.append(cid),
        )

        visit = SimpleNamespace(customer_id=customer_id, visit_date=activity_date)
        visit_service._deduct_for_arrival(visit)
        visit_service._restore_for_arrival(visit)

        assert queried_dates == [
            ("gcs", activity_date),
            ("ers", activity_date),
            ("class", activity_date),
            ("gcs", activity_date),
            ("ers", activity_date),
            ("class", activity_date),
        ]
        assert synced[:3] == [
            (customer_id, "gcs:session-1", 2),
            (customer_id, "ers:session-1", 2),
            (customer_id, "class:class-1", 2),
        ]
        assert synced[3:] == [
            (customer_id, "gcs:session-1", 0),
            (customer_id, "ers:session-1", 0),
            (customer_id, "class:class-1", 0),
        ]
        assert saved_customers == [customer_id, customer_id]


class TestVisitReorderOperationLog:
    """邀约排序日志不应被误记为新增邀约。"""

    def test_reorder_log_has_readable_content_without_raw_ids(self, client):
        ids = [_u(), _u(), _u()]
        response = client.post(
            "/api/visits/reorder",
            json={"ids": ids},
            headers={"X-Client-Type": "miniprogram"},
        )
        assert response.status_code == 200

        logs = client.get(
            "/api/operation-logs",
            params={"section": "邀约", "source": "miniprogram"},
        ).json()
        log = next(item for item in logs if item["path"] == "/api/visits/reorder")

        assert log["content"] == "调整邀约排序（3条记录）"
        assert log["entity_id"] == ""
        assert log["after_data"] is None
        assert all(record_id not in str(log) for record_id in ids)

    def test_reorder_log_records_moved_customer_and_positions(self, client):
        ids = [_u(), _u(), _u()]
        response = client.post(
            "/api/visits/reorder",
            json={
                "ids": ids,
                "moved_name": "小林",
                "from_position": 3,
                "to_position": 1,
            },
        )
        assert response.status_code == 200

        logs = client.get(
            "/api/operation-logs",
            params={"section": "邀约", "source": "pc"},
        ).json()
        log = next(item for item in logs if item["path"] == "/api/visits/reorder")

        assert log["content"] == "调整邀约排序：将“小林”从第3位移动到第1位"
        assert log["after_data"] is None


class TestActivityOrderOperationLog:
    """课表排序应归入课表并记录具体移动内容。"""

    def test_activity_order_log_records_course_and_positions(self, client):
        response = client.post(
            "/api/activity-orders",
            json={
                "date": "2026-08-20",
                "space_id": "space-1",
                "order": ["class-a", "gcs-b"],
                "moved_name": "读书会",
                "from_position": 1,
                "to_position": 2,
            },
        )
        assert response.status_code == 200

        logs = client.get(
            "/api/operation-logs",
            params={"section": "课表", "source": "pc"},
        ).json()
        log = next(item for item in logs if item["path"] == "/api/activity-orders")

        assert log["content"] == "调整课表排序：将“读书会”从第1位移动到第2位"
        assert log["after_data"] is None


class TestVisitDelete:
    """到访记录删除"""

    def test_delete_existing(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-08-03",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        resp = client.delete(f"/api/visits/{vid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/visits/nonexistent")
        assert resp.status_code == 404

    def test_deleted_not_in_list(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-08-04",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        client.delete(f"/api/visits/{vid}")
        resp = client.get("/api/visits")
        assert not any(v["id"] == vid for v in resp.json())

    def test_deleted_not_gettable(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-08-05",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        client.delete(f"/api/visits/{vid}")
        resp = client.get(f"/api/visits/{vid}")
        assert resp.status_code == 404


class TestVisitList:
    """到访记录列表和筛选"""

    def test_list_all(self, client):
        resp = client.get("/api/visits")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_by_date(self, client, created_customer):
        """按日期筛选"""
        client.post("/api/visits", json={
            "visit_date": "2026-09-01",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        resp = client.get("/api/visits?date=2026-09-01")
        assert resp.status_code == 200
        for v in resp.json():
            assert v["visit_date"] == "2026-09-01"

    def test_list_by_customer(self, client, created_customer):
        """按客户筛选"""
        client.post("/api/visits", json={
            "visit_date": "2026-09-02",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        resp = client.get(f"/api/visits?customer_id={created_customer['id']}")
        assert resp.status_code == 200
        for v in resp.json():
            assert v["customer_id"] == created_customer["id"]

    def test_list_by_date_and_customer(self, client, created_customer):
        """同时按日期和客户筛选"""
        client.post("/api/visits", json={
            "visit_date": "2026-09-03",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        resp = client.get(f"/api/visits?date=2026-09-03&customer_id={created_customer['id']}")
        assert resp.status_code == 200

    def test_list_empty_date(self, client):
        """没有数据的日期"""
        resp = client.get("/api/visits?date=2099-01-01")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_has_statistics(self, client, created_customer):
        """列表中的统计数据"""
        client.post("/api/visits", json={
            "visit_date": "2026-09-04",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        resp = client.get("/api/visits")
        visit = next((v for v in resp.json() if v["customer_id"] == created_customer["id"]), None)
        if visit:
            assert "visit_count" in visit
            assert "activity_count" in visit
            assert "welfare_count" in visit
            assert "remaining_count" in visit
            assert "activities" in visit

    def test_list_has_activities(self, client, created_customer):
        """列表中的活动信息"""
        client.post("/api/visits", json={
            "visit_date": "2026-09-05",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        resp = client.get("/api/visits")
        visit = next((v for v in resp.json() if v["customer_id"] == created_customer["id"]), None)
        if visit:
            assert isinstance(visit["activities"], list)


class TestVisitGet:
    """单条到访记录查询"""

    def test_get_existing(self, client, created_customer):
        resp = client.post("/api/visits", json={
            "visit_date": "2026-09-06",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        resp = client.get(f"/api/visits/{vid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == vid

    def test_get_nonexistent(self, client):
        resp = client.get("/api/visits/nonexistent")
        assert resp.status_code == 404

    def test_get_has_statistics(self, client, created_customer):
        """单条查询也应有统计数据"""
        resp = client.post("/api/visits", json={
            "visit_date": "2026-09-07",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        vid = resp.json()["id"]
        resp = client.get(f"/api/visits/{vid}")
        assert "visit_count" in resp.json()
        assert "activity_count" in resp.json()
        assert "activities" in resp.json()


class TestVisitSearchCustomers:
    """到访记录搜索客户"""

    def test_search_by_nickname(self, client, created_customer):
        resp = client.get(f"/api/visits/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_search_empty(self, client):
        resp = client.get("/api/visits/search-customers?q=")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_nonexistent(self, client):
        resp = client.get("/api/visits/search-customers?q=zzz_nonexistent_zzz")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_result_structure(self, client, created_customer):
        resp = client.get(f"/api/visits/search-customers?q={created_customer['nickname']}")
        if resp.json():
            r = resp.json()[0]
            assert "id" in r
            assert "nickname" in r
            assert "visit_count" in r


class TestVisitEdgeCases:
    """到访记录边界情况"""

    def test_multiple_visits_same_customer(self, client, created_customer):
        """同一客户多条到访记录"""
        dates = ["2026-10-01", "2026-10-02", "2026-10-03"]
        for date in dates:
            resp = client.post("/api/visits", json={
                "visit_date": date,
                "customer_id": created_customer["id"],
                "nickname": created_customer["nickname"],
            })
            assert resp.status_code == 200

    def test_special_characters_in_needs(self, client, created_customer):
        """需求字段特殊字符"""
        resp = client.post("/api/visits", json={
            "visit_date": "2026-10-04",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "needs": "需求：情绪释放（深度）+ 能量结",
        })
        assert resp.status_code == 200

    def test_long_text_fields(self, client, created_customer):
        """长文本字段"""
        long_text = "很长的内容" * 100
        resp = client.post("/api/visits", json={
            "visit_date": "2026-10-05",
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "needs": long_text,
            "experience": long_text,
            "feedback": long_text,
            "healing_notes": long_text,
        })
        assert resp.status_code == 200

    def test_visit_time_formats(self, client, created_customer):
        """各种时间格式 — 每个用不同日期"""
        for i, time in enumerate(["00:00", "09:30", "12:00", "18:45", "23:59"]):
            resp = client.post("/api/visits", json={
                "visit_date": f"2026-10-{20+i:02d}",
                "customer_id": created_customer["id"],
                "nickname": created_customer["nickname"],
                "visit_time": time,
            })
            assert resp.status_code == 200
            assert resp.json()["visit_time"] == time
