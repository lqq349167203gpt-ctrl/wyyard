"""客户资料 Sales 的未配置筛选。"""

import uuid


def test_unconfigured_sales_filter_and_pagination(client):
    prefix = f"Sales筛选_{uuid.uuid4().hex[:10]}"
    ids = []
    try:
        for index, sales in enumerate(("", "   ", "老师甲")):
            response = client.post("/api/customers", json={
                "nickname": f"{prefix}_{index}", "service_teacher": sales,
            })
            assert response.status_code == 200, response.text
            ids.append(response.json()["id"])
        response = client.get("/api/customers", params={
            "nickname": prefix, "service_teacher": "__unconfigured__",
            "page": 1, "page_size": 1, "list_view": True,
        })
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 2
        assert len(response.json()["items"]) == 1
        assert not (response.json()["items"][0]["service_teacher"] or "").strip()
        assigned = client.get("/api/customers", params={
            "nickname": prefix, "service_teacher": "老师甲",
        }).json()
        assert [item["id"] for item in assigned] == [ids[2]]
        assert len(client.get("/api/customers", params={"nickname": prefix}).json()) == 3
    finally:
        for customer_id in ids:
            client.delete(f"/api/customers/{customer_id}")
