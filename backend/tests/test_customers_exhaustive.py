"""客户模块穷举测试 — 覆盖每个字段、每种流量来源、每种边界情况"""
import pytest
import uuid


def _u():
    return uuid.uuid4().hex[:12]


class TestCustomerCreateFields:
    """逐字段测试客户创建"""

    def test_nickname_required(self, client):
        """昵称是唯一必填字段"""
        resp = client.post("/api/customers", json={"nickname": f"必填_{_u()}"})
        assert resp.status_code == 200

    def test_name_optional(self, client):
        """姓名可选"""
        resp = client.post("/api/customers", json={"nickname": f"无姓名_{_u()}"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "" or resp.json()["name"] is None

    def test_gender_values(self, client):
        """性别字段：男/女/空"""
        for gender in ["男", "女", ""]:
            resp = client.post("/api/customers", json={"nickname": f"性别_{_u()}", "gender": gender})
            assert resp.status_code == 200

    def test_phone_field(self, client):
        """手机号：正常/空/格式各异（手机号全局唯一，需用唯一值；用后清理）"""
        digits = "".join(c for c in _u() if c.isdigit()).ljust(8, "0")[:8]
        created_ids = []
        try:
            for phone in [f"138{digits}", f"186{digits}", "", f"021-{digits}", f"+86138{digits}"]:
                resp = client.post("/api/customers", json={"nickname": f"电话_{_u()}", "phone": phone})
                assert resp.status_code == 200
                assert resp.json()["phone"] == phone
                created_ids.append(resp.json()["id"])
        finally:
            for cid in created_ids:
                client.delete(f"/api/customers/{cid}")

    def test_wechat_field(self, client):
        """微信号：正常/空/特殊字符（微信号全局唯一，需用唯一值；用后清理）"""
        created_ids = []
        try:
            for wechat in [f"wxid_{_u()}", "", f"微信号-测试_{_u()}"]:
                resp = client.post("/api/customers", json={"nickname": f"微信_{_u()}", "wechat": wechat})
                assert resp.status_code == 200
                assert resp.json()["wechat"] == wechat
                created_ids.append(resp.json()["id"])
        finally:
            for cid in created_ids:
                client.delete(f"/api/customers/{cid}")

    def test_age_field(self, client):
        """年龄字段：数字字符串/空"""
        for age in ["18", "25", "60", "", "18-25", "26-35"]:
            resp = client.post("/api/customers", json={"nickname": f"年龄_{_u()}", "age": age})
            assert resp.status_code == 200
            assert resp.json()["age"] == age

    def test_referrer_field(self, client):
        """引流人字段"""
        resp = client.post("/api/customers", json={
            "nickname": f"引流_{_u()}",
            "referrer": "张三推荐",
        })
        assert resp.status_code == 200
        assert resp.json()["referrer"] == "张三推荐"

    def test_tags_field(self, client):
        """标签字段：多标签/空/特殊字符"""
        for tags in ["新客户,意向会员", "", "VIP,高意向,已体验"]:
            resp = client.post("/api/customers", json={"nickname": f"标签_{_u()}", "tags": tags})
            assert resp.status_code == 200
            assert resp.json()["tags"] == tags

    def test_traffic_source_all_types(self, client):
        """8种流量来源全部验证"""
        sources = ["小红书", "抖音", "公众号", "视频号", "好友推荐", "朋友圈", "美团", "其他"]
        for source in sources:
            resp = client.post("/api/customers", json={
                "nickname": f"来源_{_u()}",
                "traffic_source": source,
            })
            assert resp.status_code == 200
            assert resp.json()["traffic_source"] == source

    def test_traffic_source_empty(self, client):
        """流量来源为空"""
        resp = client.post("/api/customers", json={"nickname": f"无来源_{_u()}"})
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "" or resp.json()["traffic_source"] is None

    def test_traffic_source_detail_with_source(self, client):
        """流量来源详情：各来源对应的详情值"""
        cases = [
            ("小红书", "疗愈博主小A"),
            ("抖音", "疗愈视频号"),
            ("公众号", "无忧疗愈"),
            ("视频号", "疗愈直播"),
            ("好友推荐", "张三"),
            ("朋友圈", "李四"),
            ("美团", "店铺链接"),
            ("其他", "线下活动"),
        ]
        for source, detail in cases:
            resp = client.post("/api/customers", json={
                "nickname": f"详情_{_u()}",
                "traffic_source": source,
                "traffic_source_detail": detail,
            })
            assert resp.status_code == 200
            assert resp.json()["traffic_source"] == source
            assert resp.json()["traffic_source_detail"] == detail

    def test_basic_info_field(self, client):
        """基本信息字段"""
        resp = client.post("/api/customers", json={
            "nickname": f"基本信息_{_u()}",
            "basic_info": "长期肩颈疼痛，睡眠质量差，工作压力大",
        })
        assert resp.status_code == 200
        assert "肩颈" in resp.json()["basic_info"]

    def test_assessment_field(self, client):
        """评估字段"""
        resp = client.post("/api/customers", json={
            "nickname": f"评估_{_u()}",
            "assessment": "情绪紧张，身体僵硬，需要深度放松",
        })
        assert resp.status_code == 200
        assert resp.json()["assessment"] != ""

    def test_positions_field(self, client):
        """疗愈老师字段（列表）"""
        resp = client.post("/api/customers", json={
            "nickname": f"身份_{_u()}",
            "positions": ["成就君", "课程老师"],
        })
        assert resp.status_code == 200
        assert "成就君" in resp.json()["positions"]


class TestCustomerUpdate:
    """客户更新：逐字段测试"""

    def _create(self, client):
        resp = client.post("/api/customers", json={"nickname": f"更新测试_{_u()}"})
        return resp.json()["id"]

    def test_update_nickname(self, client):
        cid = self._create(client)
        try:
            new_name = f"新昵称_{_u()}"
            resp = client.patch(f"/api/customers/{cid}", json={"nickname": new_name})
            assert resp.status_code == 200
            assert resp.json()["nickname"] == new_name
        finally:
            client.delete(f"/api/customers/{cid}")

    def test_update_name(self, client):
        cid = self._create(client)
        resp = client.patch(f"/api/customers/{cid}", json={"name": "新姓名"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "新姓名"

    def test_update_gender(self, client):
        cid = self._create(client)
        resp = client.patch(f"/api/customers/{cid}", json={"gender": "男"})
        assert resp.status_code == 200
        assert resp.json()["gender"] == "男"

    def test_update_phone(self, client):
        cid = self._create(client)
        try:
            digits = "".join(c for c in _u() if c.isdigit()).ljust(8, "0")[:8]
            new_phone = f"139{digits}"
            resp = client.patch(f"/api/customers/{cid}", json={"phone": new_phone})
            assert resp.status_code == 200
            assert resp.json()["phone"] == new_phone
        finally:
            client.delete(f"/api/customers/{cid}")

    def test_update_wechat(self, client):
        cid = self._create(client)
        try:
            new_wechat = f"new_wechat_{_u()}"
            resp = client.patch(f"/api/customers/{cid}", json={"wechat": new_wechat})
            assert resp.status_code == 200
            assert resp.json()["wechat"] == new_wechat
        finally:
            client.delete(f"/api/customers/{cid}")

    def test_update_traffic_source(self, client):
        cid = self._create(client)
        resp = client.patch(f"/api/customers/{cid}", json={
            "traffic_source": "抖音",
            "traffic_source_detail": "新的详情",
        })
        assert resp.status_code == 200
        assert resp.json()["traffic_source"] == "抖音"
        assert resp.json()["traffic_source_detail"] == "新的详情"

    def test_update_tags(self, client):
        cid = self._create(client)
        resp = client.patch(f"/api/customers/{cid}", json={"tags": "VIP,已升级"})
        assert resp.status_code == 200
        assert resp.json()["tags"] == "VIP,已升级"

    def test_update_basic_info(self, client):
        cid = self._create(client)
        resp = client.patch(f"/api/customers/{cid}", json={"basic_info": "更新后的信息"})
        assert resp.status_code == 200
        assert resp.json()["basic_info"] == "更新后的信息"

    def test_update_assessment(self, client):
        cid = self._create(client)
        resp = client.patch(f"/api/customers/{cid}", json={"assessment": "更新后的评估"})
        assert resp.status_code == 200
        assert resp.json()["assessment"] == "更新后的评估"

    def test_update_positions(self, client):
        cid = self._create(client)
        resp = client.patch(f"/api/customers/{cid}", json={"positions": ["能量结老师"]})
        assert resp.status_code == 200
        assert "能量结老师" in resp.json()["positions"]

    def test_update_traffic_source_clear(self, client):
        """清除流量来源"""
        cid = self._create(client)
        client.patch(f"/api/customers/{cid}", json={"traffic_source": "小红书", "traffic_source_detail": "test"})
        resp = client.patch(f"/api/customers/{cid}", json={"traffic_source": "", "traffic_source_detail": ""})
        assert resp.status_code == 200

    def test_update_nonexistent(self, client):
        """更新不存在的客户"""
        resp = client.patch("/api/customers/nonexistent", json={"nickname": "x"})
        assert resp.status_code == 404


class TestCustomerDelete:
    """客户删除"""

    def test_delete_existing(self, client):
        resp = client.post("/api/customers", json={"nickname": f"待删_{_u()}"})
        cid = resp.json()["id"]
        resp = client.delete(f"/api/customers/{cid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/customers/nonexistent")
        assert resp.status_code == 404

    def test_deleted_not_in_list(self, client):
        """删除后不在列表中"""
        resp = client.post("/api/customers", json={"nickname": f"删后检查_{_u()}"})
        cid = resp.json()["id"]
        client.delete(f"/api/customers/{cid}")
        resp = client.get("/api/customers")
        assert not any(c["id"] == cid for c in resp.json())

    def test_deleted_not_gettable(self, client):
        """删除后无法直接获取"""
        resp = client.post("/api/customers", json={"nickname": f"删后GET_{_u()}"})
        cid = resp.json()["id"]
        client.delete(f"/api/customers/{cid}")
        resp = client.get(f"/api/customers/{cid}")
        assert resp.status_code == 404

    def test_deleted_detail_404(self, client):
        """删除后详情接口返回 404"""
        resp = client.post("/api/customers", json={"nickname": f"删后详情_{_u()}"})
        cid = resp.json()["id"]
        client.delete(f"/api/customers/{cid}")
        resp = client.get(f"/api/customer-detail/{cid}")
        assert resp.status_code == 404


class TestCustomerList:
    """客户列表"""

    def test_list_returns_list(self, client):
        resp = client.get("/api/customers")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_contains_created(self, client):
        """创建的客户出现在列表中"""
        u = _u()
        resp = client.post("/api/customers", json={"nickname": f"列表测试_{u}"})
        cid = resp.json()["id"]
        resp = client.get("/api/customers")
        assert any(c["id"] == cid for c in resp.json())

    def test_list_has_visit_count(self, client):
        """列表中的客户包含到店次数"""
        resp = client.get("/api/customers")
        assert resp.status_code == 200
        if resp.json():
            assert "visit_count" in resp.json()[0]

    def test_list_has_member_type(self, client):
        """列表中的客户包含会员类型"""
        resp = client.get("/api/customers")
        assert resp.status_code == 200
        if resp.json():
            assert "member_type" in resp.json()[0]


class TestCustomerGet:
    """单个客户查询"""

    def test_get_existing(self, client, created_customer):
        resp = client.get(f"/api/customers/{created_customer['id']}")
        assert resp.status_code == 200
        assert resp.json()["id"] == created_customer["id"]

    def test_get_nonexistent(self, client):
        resp = client.get("/api/customers/nonexistent")
        assert resp.status_code == 404


class TestCustomerDetail:
    """客户详情（聚合视图）"""

    def test_detail_structure(self, client, created_customer):
        """详情接口返回完整结构"""
        resp = client.get(f"/api/customer-detail/{created_customer['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert "customer" in data
        assert "visit_records" in data
        assert "healing_records" in data
        assert "payment_records" in data
        assert "purchase_summary" in data
        assert "activities" in data

    def test_detail_customer_matches(self, client, created_customer):
        """详情中的客户信息与直接查询一致"""
        resp = client.get(f"/api/customer-detail/{created_customer['id']}")
        detail = resp.json()["customer"]
        assert detail["id"] == created_customer["id"]
        assert detail["nickname"] == created_customer["nickname"]

    def test_detail_with_visit_records(self, client, created_customer):
        """有到访记录时，详情中包含它们"""
        cid = created_customer["id"]
        client.post("/api/visits", json={
            "visit_date": "2026-08-01",
            "customer_id": cid,
            "nickname": created_customer["nickname"],
        })
        resp = client.get(f"/api/customer-detail/{cid}")
        assert len(resp.json()["visit_records"]) >= 1

    def test_detail_with_healing_records(self, client, created_customer):
        """有疗愈记录时，详情中包含它们"""
        cid = created_customer["id"]
        client.post("/api/healing-records", json={
            "customer_id": cid,
            "customer_name": created_customer["nickname"],
            "date": "2026-08-01",
            "title": "详情测试记录",
        })
        resp = client.get(f"/api/customer-detail/{cid}")
        assert len(resp.json()["healing_records"]) >= 1

    def test_detail_with_membership_card(self, client, created_customer):
        """有会员卡时，详情中包含购买信息"""
        cid = created_customer["id"]
        client.post("/api/membership-cards", json={
            "customer_id": cid,
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-01",
        })
        resp = client.get(f"/api/customer-detail/{cid}")
        assert len(resp.json()["purchase_summary"]) >= 1

    def test_detail_nonexistent(self, client):
        resp = client.get("/api/customer-detail/nonexistent")
        assert resp.status_code == 404


class TestCustomerParseChat:
    """聊天记录解析"""

    @pytest.mark.skip(reason="需要 AI API 配置，测试环境不可用")
    def test_parse_chat_basic(self, client):
        """解析基本聊天记录"""
        resp = client.post("/api/customers/parse-chat", json={
            "chat_log": "我叫张三，女，电话13800001111，想了解疗愈课程",
        })
        assert resp.status_code == 200

    @pytest.mark.skip(reason="需要 AI API 配置，测试环境不可用")
    def test_parse_chat_empty(self, client):
        """空聊天记录"""
        resp = client.post("/api/customers/parse-chat", json={"chat_log": ""})
        assert resp.status_code == 200


class TestCustomerGenerateTags:
    """标签生成"""

    @pytest.mark.skip(reason="需要 AI API 配置，测试环境不可用")
    def test_generate_tags(self, client):
        resp = client.post("/api/customers/generate-tags", json={
            "tags": "新客户 想体验疗愈",
        })
        assert resp.status_code == 200


class TestCustomerEdgeCases:
    """客户模块边界情况"""

    def test_special_characters_in_nickname(self, client):
        """昵称含特殊字符（昵称全局唯一，需加唯一后缀；用后清理）"""
        created_ids = []
        try:
            for name in ["测试（VIP）", "客户-A", "张三/B组", "测试@123", "emoji测试"]:
                unique_name = f"{name}_{_u()}"
                resp = client.post("/api/customers", json={"nickname": unique_name})
                assert resp.status_code == 200
                assert resp.json()["nickname"] == unique_name
                created_ids.append(resp.json()["id"])
        finally:
            for cid in created_ids:
                client.delete(f"/api/customers/{cid}")

    def test_long_nickname(self, client):
        """超长昵称：nickname 上限 50 字符，恰好 50 可创建，超限应 422"""
        ok_name = "很长的昵称" * 9 + _u()[:5]  # 恰好 50 字符
        resp = client.post("/api/customers", json={"nickname": ok_name})
        assert resp.status_code == 200
        client.delete(f"/api/customers/{resp.json()['id']}")
        long_name = "很长的昵称" * 20  # 100 字符，超限
        resp = client.post("/api/customers", json={"nickname": long_name})
        assert resp.status_code == 422

    def test_unicode_fields(self, client):
        """Unicode 字符"""
        resp = client.post("/api/customers", json={
            "nickname": f"测试_{_u()}",
            "name": "张三丰",
            "basic_info": "客户描述：情绪低落 😔，需要放松 🧘",
        })
        assert resp.status_code == 200

    def test_empty_body(self, client):
        """空请求体 — 昵称是必填字段，后端应拒绝（与 test_nickname_required 一致）"""
        resp = client.post("/api/customers", json={})
        assert resp.status_code == 422

    def test_null_nickname(self, client):
        """昵称为 null"""
        resp = client.post("/api/customers", json={"nickname": None})
        assert resp.status_code == 422

    def test_multiple_customers_independent(self, client):
        """多个客户互相独立"""
        ids = []
        try:
            for i in range(5):
                resp = client.post("/api/customers", json={"nickname": f"独立客户_{i}_{_u()}"})
                ids.append(resp.json()["id"])
            # 所有 ID 唯一
            assert len(set(ids)) == 5
            # 修改一个不影响其他（昵称需唯一后缀，避免与历史数据冲突）
            changed = f"已修改_{_u()}"
            resp = client.patch(f"/api/customers/{ids[0]}", json={"nickname": changed})
            assert resp.status_code == 200
            resp = client.get(f"/api/customers/{ids[1]}")
            assert resp.json()["nickname"] != changed
        finally:
            for cid in ids:
                client.delete(f"/api/customers/{cid}")

    def test_traffic_source_detail_without_source(self, client):
        """有详情但无来源"""
        resp = client.post("/api/customers", json={
            "nickname": f"无来源有详情_{_u()}",
            "traffic_source_detail": "某个链接",
        })
        assert resp.status_code == 200
