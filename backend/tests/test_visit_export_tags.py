"""邀约导出使用客户当前可见标签，保持列顺序及原有格式。"""

from datetime import datetime, timezone
from io import BytesIO

import jwt
import pytest
from openpyxl import load_workbook

from app.models.customer_tag import CustomerTag, CustomerTagAssignment
from app.services import customer_tag_service


@pytest.mark.parametrize("has_tags", [True, False])
def test_visit_list_and_export_include_visible_customer_tags(client, created_customer, monkeypatch, has_tags):
    token = client.headers["Authorization"].removeprefix("Bearer ")
    actor_id = jwt.decode(token, options={"verify_signature": False})["sub"]
    now = datetime.now(timezone.utc)
    tags = {}
    for tag_id, name, overrides in (
        ("public", "公共客户标签", {}),
        ("own", "我的私有标签", {"scope": "private"}),
        ("other", "他人的私有标签", {"scope": "private", "created_by_id": "other-user"}),
        ("disabled", "已停用标签", {"enabled": False}),
        ("deleted", "已删除标签", {"is_deleted": True}),
        ("need", "来访需求标签", {"category": "visit_need"}),
    ):
        tags[tag_id] = CustomerTag(**{
            "id": tag_id, "name": name, "scope": "public", "created_by_id": actor_id,
            "created_by_name": "测试用户", "created_at": now, "updated_at": now, **overrides,
        })
    monkeypatch.setattr(customer_tag_service, "_tags", tags)
    monkeypatch.setattr(customer_tag_service, "_assignments", {
        tag_id: CustomerTagAssignment(
            id=tag_id, customer_id=created_customer["id"], tag_id=tag_id,
            created_by_id=actor_id, created_by_name="测试用户", created_at=now,
        )
        for tag_id in tags
    } if has_tags else {})

    day = "2099-10-19"
    response = client.post("/api/visits", json={
        "visit_date": day, "customer_id": created_customer["id"], "is_leader": True,
    })
    assert response.status_code == 200, response.text
    visit = response.json()
    expected_names = ["公共客户标签", "我的私有标签"] if has_tags else []
    try:
        # PC 导出读取最新邀约列表；分页读取也使用相同的可见标签口径。
        for params in ({"date": day}, {"date": day, "page": 1, "page_size": 10}):
            listed = client.get("/api/visits", params=params)
            assert listed.status_code == 200, listed.text
            items = listed.json() if "page" not in params else listed.json()["items"]
            item = next(item for item in items if item["id"] == visit["id"])
            assert [tag["name"] for tag in item["customer_tags"]] == expected_names

        # 小程序通过后端直接下载 Excel，客户标签必须紧跟会员身份。
        exported = client.get("/api/visits/export", params={"date": day})
        assert exported.status_code == 200, exported.text
        sheet = load_workbook(BytesIO(exported.content)).active
        headers = [cell.value for cell in sheet[1]]
        tag_index = headers.index("客户标签")
        assert tag_index == headers.index("会员身份") + 1
        assert headers[tag_index + 1] == "来访需求"
        row = next(row for row in sheet.iter_rows(min_row=2) if row[1].value == created_customer["nickname"])
        assert row[tag_index].value == ("、".join(expected_names) or None)
        assert row[tag_index].alignment.wrap_text is True
        assert all(cell.fill.fgColor.rgb == "FFFEFA53" for cell in row)
        assert sheet.column_dimensions[row[tag_index].column_letter].width == 24
        assert sheet.column_dimensions[row[headers.index("目标")].column_letter].width == 20
    finally:
        client.delete(f"/api/visits/{visit['id']}")


def test_empty_visit_export_keeps_customer_tag_header(client):
    response = client.get("/api/visits/export", params={"date": "2099-10-20"})
    assert response.status_code == 200, response.text
    sheet = load_workbook(BytesIO(response.content)).active
    headers = [cell.value for cell in sheet[1]]
    assert headers[headers.index("会员身份") + 1] == "客户标签"
    assert sheet.max_row == 1
