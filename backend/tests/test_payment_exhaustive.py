"""付费项目穷举测试 — 5种付费类型，逐字段、逐业务规则"""
import pytest
import uuid


def _u():
    return uuid.uuid4().hex[:8]


# ===== 会员卡 =====

class TestMembershipCardCreate:
    """会员卡创建"""

    def test_create_experience_card(self, client, created_customer):
        """体验会员"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-01",
        })
        assert resp.status_code == 200
        assert resp.json()["card_type"] == "体验会员"
        assert resp.json()["price"] == 399.0

    def test_create_regular_card(self, client, created_customer):
        """常规通卡"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "常规通卡",
            "price": 3999.0,
            "effective_date": "2026-05-01",
            "remaining_count": 20,
        })
        assert resp.status_code == 200
        assert resp.json()["remaining_count"] == 20

    def test_create_half_year_card(self, client, created_customer):
        """半年卡"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "半年卡",
            "price": 5999.0,
            "effective_date": "2026-05-01",
        })
        assert resp.status_code == 200

    def test_create_year_card(self, client, created_customer):
        """年卡"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "年卡",
            "price": 9999.0,
            "effective_date": "2026-05-01",
        })
        assert resp.status_code == 200

    def test_remaining_count_variations(self, client, created_customer):
        """不同剩余次数"""
        for count in [0, 1, 5, 10, 20, 50, 100]:
            resp = client.post("/api/membership-cards", json={
                "customer_id": created_customer["id"],
                "nickname": created_customer["nickname"],
                "card_type": "常规通卡",
                "price": 100.0,
                "effective_date": "2026-05-01",
                "remaining_count": count,
            })
            assert resp.status_code == 200
            assert resp.json()["remaining_count"] == count

    def test_with_closer(self, client, created_customer):
        """带成交人"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-01",
            "closer_id": "closer-001",
            "closer_name": "销售A",
        })
        assert resp.status_code == 200
        assert resp.json()["closer_name"] == "销售A"

    def test_with_expiry_date(self, client, created_customer):
        """到期日期由 duration_type + duration_value 自动计算"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-01",
            "duration_type": "month",
            "duration_value": 3,
        })
        assert resp.status_code == 200
        assert resp.json()["expiry_date"] == "2026-08-01"

    def test_with_duration_type(self, client, created_customer):
        """带有效期类型"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-01",
            "duration_type": "month",
            "duration_value": 3,
        })
        assert resp.status_code == 200

    def test_all_fields(self, client, created_customer):
        """所有字段"""
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "常规通卡",
            "price": 3999.0,
            "effective_date": "2026-05-01",
            "expiry_date": "2027-05-01",
            "remaining_count": 20,
            "closer_id": "c1",
            "closer_name": "销售",
            "duration_type": "year",
            "duration_value": 1,
        })
        assert resp.status_code == 200


class TestMembershipCardUpdate:
    """会员卡更新"""

    def _create(self, client, customer):
        resp = client.post("/api/membership-cards", json={
            "customer_id": customer["id"],
            "nickname": customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-01",
        })
        return resp.json()["id"]

    def test_update_remaining_count(self, client, created_customer):
        cid = self._create(client, created_customer)
        resp = client.patch(f"/api/membership-cards/{cid}", json={"remaining_count": 15})
        assert resp.status_code == 200
        assert resp.json()["remaining_count"] == 15

    def test_update_price(self, client, created_customer):
        cid = self._create(client, created_customer)
        resp = client.patch(f"/api/membership-cards/{cid}", json={"price": 599.0})
        assert resp.status_code == 200
        assert resp.json()["price"] == 599.0

    def test_update_card_type(self, client, created_customer):
        cid = self._create(client, created_customer)
        resp = client.patch(f"/api/membership-cards/{cid}", json={"card_type": "年卡"})
        assert resp.status_code == 200
        assert resp.json()["card_type"] == "年卡"

    def test_update_effective_date(self, client, created_customer):
        cid = self._create(client, created_customer)
        resp = client.patch(f"/api/membership-cards/{cid}", json={"effective_date": "2026-06-01"})
        assert resp.status_code == 200

    def test_update_expiry_date(self, client, created_customer):
        cid = self._create(client, created_customer)
        resp = client.patch(f"/api/membership-cards/{cid}", json={"expiry_date": "2027-06-01"})
        assert resp.status_code == 200

    def test_update_closer(self, client, created_customer):
        cid = self._create(client, created_customer)
        resp = client.patch(f"/api/membership-cards/{cid}", json={"closer_name": "新销售"})
        assert resp.status_code == 200

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/membership-cards/nonexistent", json={"price": 1})
        assert resp.status_code == 404


class TestMembershipCardDelete:
    def test_delete_existing(self, client, created_customer):
        resp = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "体验会员",
            "price": 399.0,
            "effective_date": "2026-05-01",
        })
        cid = resp.json()["id"]
        resp = client.delete(f"/api/membership-cards/{cid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/membership-cards/nonexistent")
        assert resp.status_code == 404


class TestMembershipCardQuery:
    def test_list(self, client):
        resp = client.get("/api/membership-cards")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/membership-cards/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200

    def test_search_customers_empty(self, client):
        resp = client.get("/api/membership-cards/search-customers?q=")
        assert resp.status_code == 200
        assert resp.json() == []


# ===== 觉醒游戏购买记录 =====

class TestGroupCaseCRUD:
    def test_create(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "purchase_count": 5,
            "amount": 1999.0,
        })
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 5
        assert resp.json()["amount"] == 1999.0

    def test_create_minimal(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        assert resp.status_code == 200

    def test_create_with_closer(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "purchase_count": 3,
            "amount": 999.0,
            "closer_id": "c1",
            "closer_name": "销售B",
        })
        assert resp.status_code == 200

    def test_create_with_dates(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "effective_date": "2026-05-01",
            "expiry_date": "2026-11-01",
        })
        assert resp.status_code == 200

    def test_update(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        cid = resp.json()["id"]
        resp = client.patch(f"/api/group-cases/{cid}", json={"purchase_count": 10})
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 10

    def test_update_amount(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        cid = resp.json()["id"]
        resp = client.patch(f"/api/group-cases/{cid}", json={"amount": 2999.0})
        assert resp.status_code == 200
        assert resp.json()["amount"] == 2999.0

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/group-cases/nonexistent", json={"purchase_count": 1})
        assert resp.status_code == 404

    def test_delete(self, client, created_customer):
        resp = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        cid = resp.json()["id"]
        resp = client.delete(f"/api/group-cases/{cid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/group-cases/nonexistent")
        assert resp.status_code in (400, 404)

    def test_list(self, client):
        resp = client.get("/api/group-cases")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/group-cases/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200

    def test_search_customers_empty(self, client):
        resp = client.get("/api/group-cases/search-customers?q=")
        assert resp.status_code == 200
        assert resp.json() == []


# ===== 情绪释放购买记录 =====

class TestEmotionalReleaseCRUD:
    def test_create(self, client, created_customer):
        resp = client.post("/api/emotional-releases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "purchase_count": 10,
            "amount": 2999.0,
        })
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 10

    def test_create_minimal(self, client, created_customer):
        resp = client.post("/api/emotional-releases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        assert resp.status_code == 200

    def test_create_with_closer(self, client, created_customer):
        resp = client.post("/api/emotional-releases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "closer_id": "c1",
            "closer_name": "销售C",
        })
        assert resp.status_code == 200

    def test_create_with_dates(self, client, created_customer):
        resp = client.post("/api/emotional-releases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "effective_date": "2026-05-01",
            "expiry_date": "2026-11-01",
        })
        assert resp.status_code == 200

    def test_update(self, client, created_customer):
        resp = client.post("/api/emotional-releases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/emotional-releases/{rid}", json={"purchase_count": 5})
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 5

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/emotional-releases/nonexistent", json={"purchase_count": 1})
        assert resp.status_code == 404

    def test_delete(self, client, created_customer):
        resp = client.post("/api/emotional-releases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/emotional-releases/{rid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/emotional-releases/nonexistent")
        assert resp.status_code in (400, 404)

    def test_list(self, client):
        resp = client.get("/api/emotional-releases")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/emotional-releases/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200


# ===== 能量结购买记录 =====

class TestEnergyKnotCRUD:
    def test_create(self, client, created_customer):
        resp = client.post("/api/energy-knots", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "purchase_count": 3,
            "amount": 999.0,
        })
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 3

    def test_create_minimal(self, client, created_customer):
        resp = client.post("/api/energy-knots", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        assert resp.status_code == 200

    def test_create_with_closer(self, client, created_customer):
        resp = client.post("/api/energy-knots", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "closer_id": "c1",
            "closer_name": "销售D",
        })
        assert resp.status_code == 200

    def test_update(self, client, created_customer):
        resp = client.post("/api/energy-knots", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/energy-knots/{rid}", json={"purchase_count": 7})
        assert resp.status_code == 200
        assert resp.json()["purchase_count"] == 7

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/energy-knots/nonexistent", json={"purchase_count": 1})
        assert resp.status_code == 404

    def test_delete(self, client, created_customer):
        resp = client.post("/api/energy-knots", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/energy-knots/{rid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/energy-knots/nonexistent")
        assert resp.status_code in (400, 404)

    def test_list(self, client):
        resp = client.get("/api/energy-knots")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/energy-knots/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200


# ===== 内部课程购买记录 =====

class TestInternalCourseCRUD:
    def test_create(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
        })
        assert resp.status_code == 200
        assert resp.json()["course_type"] == "疗愈师课程"

    def test_create_all_course_types(self, client, created_customer):
        """所有课程类型"""
        for ct in ["疗愈师课程", "商业框架陪跑", "落地赋能班"]:
            resp = client.post("/api/internal-courses", json={
                "customer_id": created_customer["id"],
                "nickname": created_customer["nickname"],
                "course_type": ct,
                "price": 100.0,
                "effective_date": "2026-05-01",
            })
            assert resp.status_code == 200, f"创建 {ct} 失败"

    def test_create_minimal(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
        })
        assert resp.status_code == 200

    def test_create_with_closer(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
            "closer_id": "c1",
            "closer_name": "销售E",
        })
        assert resp.status_code == 200

    def test_create_with_expiry(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
            "expiry_date": "2027-05-01",
        })
        assert resp.status_code == 200

    def test_update(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/internal-courses/{rid}", json={"price": 6000.0})
        assert resp.status_code == 200
        assert resp.json()["price"] == 6000.0

    def test_update_course_type(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
        })
        rid = resp.json()["id"]
        resp = client.patch(f"/api/internal-courses/{rid}", json={"course_type": "落地赋能班"})
        assert resp.status_code == 200

    def test_update_nonexistent(self, client):
        resp = client.patch("/api/internal-courses/nonexistent", json={"price": 1})
        assert resp.status_code == 404

    def test_delete(self, client, created_customer):
        resp = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "course_type": "疗愈师课程",
            "price": 5000.0,
            "effective_date": "2026-05-01",
        })
        rid = resp.json()["id"]
        resp = client.delete(f"/api/internal-courses/{rid}")
        assert resp.status_code == 200

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/internal-courses/nonexistent")
        assert resp.status_code == 404

    def test_list(self, client):
        resp = client.get("/api/internal-courses")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_search_customers(self, client, created_customer):
        resp = client.get(f"/api/internal-courses/search-customers?q={created_customer['nickname']}")
        assert resp.status_code == 200
