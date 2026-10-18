"""改名后的历史交易仍按客户 ID 检索，覆盖多端共用的后端入口。"""

import pytest
from app.services import customer_access_service, customer_service, project_deduction_service


@pytest.mark.parametrize("path,fields", [
    ("membership-cards", {"card_type": "次卡", "price": 0}),
    ("group-cases", {"purchase_count": 1, "amount": 0}),
    ("emotional-releases", {"purchase_count": 1, "amount": 0}),
    ("energy-knots", {"purchase_count": 1, "amount": 0}),
    ("oh-card-readings", {"reading_type": "OH卡情感梳理", "amount": 0}),
    ("tea-seat-fees", {"quantity": 1, "amount": 0}),
    ("offline-courses", {"course_type": "主理人训练", "amount": 0}),
    ("internal-courses", {"course_type": "OH卡技能梳理", "price": 0}),
    ("other-projects", {"project_name": "历史交易", "fee": 0}),
])
def test_customer_rename_keeps_history_searchable_before_paging(client, created_customer, path, fields):
    cid = created_customer["id"]
    old_name = created_customer["nickname"]
    urls = []
    record_ids = set()
    try:
        for day in ("2026-09-01", "2026-09-02"):
            response = client.post(f"/api/{path}", json={
                "customer_id": cid, "nickname": old_name, "deal_date": day,
                "effective_date": day, **fields,
            })
            assert response.status_code == 200, response.text
            record_ids.add(response.json()["id"])
            urls.append(f"/api/{path}/{response.json()['id']}")
        current_name = f"David学宝_{cid}"
        real_name = f"真实姓名_{cid}"
        renamed = client.patch(f"/api/customers/{cid}", json={"nickname": current_name, "name": real_name})
        assert renamed.status_code == 200, renamed.text
        # 新昵称、真实姓名、历史昵称、大小写和输入两侧空格都能找到同一组订单。
        for query in (current_name, real_name, old_name, f"  {current_name.swapcase()}  "):
            pages = []
            for page in (1, 2):
                response = client.get(f"/api/{path}", params={"nickname": query, "page": page, "page_size": 1})
                assert response.status_code == 200, response.text
                result = response.json()
                assert result["total"] == 2
                pages.extend(result["items"])
            assert {row["id"] for row in pages} == record_ids
            assert all(row["nickname"] == old_name for row in pages)  # 不改写历史交易快照。
        keyword = client.get(f"/api/{path}", params={"keyword": current_name, "page": 1}).json()
        assert {row["id"] for row in keyword["items"]} == record_ids
        combined = client.get("/api/payment-exports/records", params={"nickname": current_name, "page_size": 100}).json()
        assert {row["record"]["id"] for row in combined["items"]} == record_ids
        # 二次改名不需要批量同步订单，也不能保留过期的客户目录缓存。
        next_name = f"新昵称_{cid}"
        assert client.patch(f"/api/customers/{cid}", json={"nickname": next_name}).status_code == 200
        assert client.get(f"/api/{path}", params={"nickname": next_name, "page": 1}).json()["total"] == 2
    finally:
        for url in urls:
            client.delete(url)


def test_current_name_search_does_not_bypass_customer_scope(client, created_customer, monkeypatch):
    from app.utils.customer_record_search import customer_record_matcher

    cid = created_customer["id"]
    nickname = created_customer["nickname"]
    class Record:
        def __init__(self, id, customer_id):
            self.data = {"id": id, "customer_id": customer_id, "nickname": "历史昵称",
                         "project_name": "粗门次卡", "deduction_date": "2026-09-01"}

        def model_dump(self, **kwargs):
            return dict(self.data)

    assert customer_record_matcher(nickname)({"customer_id": cid, "nickname": "历史昵称"})
    assert not customer_record_matcher(nickname)({"customer_id": "other", "nickname": "历史昵称"})
    monkeypatch.setattr(project_deduction_service, "list_deductions", lambda *args, **kwargs: [Record("visible", cid), Record("hidden", "other")])
    monkeypatch.setattr(customer_access_service, "visible_customer_ids", lambda *args: {cid})
    response = client.get("/api/project-deductions", params={"nickname": nickname, "card_type": "粗门次卡", "page": 1})
    assert response.status_code == 200, response.text
    assert [row["id"] for row in response.json()["items"]] == ["visible"]
    # 当前名字也不能绕过“不可查看此客户”的过滤。
    monkeypatch.setattr(customer_access_service, "visible_customer_ids", lambda *args: set())
    assert client.get("/api/project-deductions", params={"nickname": nickname, "page": 1}).json()["total"] == 0
    assert customer_service.get_customer(cid).nickname == nickname
