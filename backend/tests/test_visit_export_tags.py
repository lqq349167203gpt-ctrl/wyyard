"""邀约导出使用本条来访需求的标签，不混入客户档案标签。"""

from datetime import datetime, timezone
from io import BytesIO

import jwt
import pytest
from openpyxl import load_workbook

from app.models.customer_tag import CustomerTag, CustomerTagAssignment
from app.services import (
    customer_access_service,
    customer_tag_service,
    position_edit_permission_service,
    visit_note_service,
)


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
    need_note = client.post("/api/visit-notes", json={
        "visit_id": visit["id"], "category": "visit_need", "content": "本次来访详情",
        "need_tag_ids": ["need"] if has_tags else [],
    })
    assert need_note.status_code == 200, need_note.text
    expected_need_names = ["来访需求标签"] if has_tags else []
    try:
        # PC 导出读取最新邀约列表；分页读取也使用相同的可见标签口径。
        for params in ({"date": day}, {"date": day, "page": 1, "page_size": 10}):
            listed = client.get("/api/visits", params=params)
            assert listed.status_code == 200, listed.text
            items = listed.json() if "page" not in params else listed.json()["items"]
            item = next(item for item in items if item["id"] == visit["id"])
            assert [tag["name"] for tag in item["customer_tags"]] == expected_names
            assert item["visit_need_tags"] == expected_need_names

        # 小程序直接下载 Excel；PC 则使用上述同源字段，不读取客户档案标签。
        exported = client.get("/api/visits/export", params={"date": day})
        assert exported.status_code == 200, exported.text
        sheet = load_workbook(BytesIO(exported.content)).active
        headers = [cell.value for cell in sheet[1]]
        tag_index = headers.index("来访标签")
        assert "客户标签" not in headers
        assert tag_index == headers.index("会员身份") + 1
        assert headers[tag_index + 1] == "来访需求"
        row = next(row for row in sheet.iter_rows(min_row=2) if row[1].value == created_customer["nickname"])
        assert row[tag_index].value == ("、".join(expected_need_names) or None)
        assert row[tag_index].alignment.wrap_text is True
        assert all(cell.fill.fgColor.rgb == "FFFEFA53" for cell in row)
        assert sheet.column_dimensions[row[tag_index].column_letter].width == 24
        assert sheet.column_dimensions[row[headers.index("目标")].column_letter].width == 20
    finally:
        client.delete(f"/api/visits/{visit['id']}")


def test_empty_visit_export_keeps_visit_need_tag_header(client):
    response = client.get("/api/visits/export", params={"date": "2099-10-20"})
    assert response.status_code == 200, response.text
    sheet = load_workbook(BytesIO(response.content)).active
    headers = [cell.value for cell in sheet[1]]
    assert headers[headers.index("会员身份") + 1] == "来访标签"
    assert sheet.max_row == 1


@pytest.mark.parametrize("tag_access,detail_access", [(True, False), (False, True), (False, False)])
def test_visit_need_tag_export_respects_split_permissions(client, created_customer, monkeypatch, tag_access, detail_access):
    visit = client.post("/api/visits", json={"visit_date": "2099-10-21", "customer_id": created_customer["id"]}).json()
    tag_response = client.post("/api/customer-tags", json={"name": f"本次来访标签_{visit['id']}", "scope": "public", "category": "visit_need"})
    assert tag_response.status_code == 200, tag_response.text
    tag = tag_response.json()
    note = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "visit_need",
        "content": "仅详情可见的文字", "need_tag_ids": [tag["id"]]})
    assert note.status_code == 200, note.text
    access = position_edit_permission_service._empty_customer_access()
    access["scope"] = "all"
    access["detail_tabs"].update(visit_need_tags=tag_access, visit_need_detail=detail_access)
    monkeypatch.setattr(customer_access_service, "get_customer_permissions", lambda _: access)
    listed = client.get("/api/visits", params={"date": "2099-10-21"}).json()
    item = next(row for row in listed if row["id"] == visit["id"])
    assert item["visit_need_tags"] == ([tag["name"]] if tag_access else [])
    response = client.get("/api/visits/export", params={"date": "2099-10-21"})
    assert response.status_code == 200, response.text
    sheet = load_workbook(BytesIO(response.content)).active
    headers = [cell.value for cell in sheet[1]]
    assert ("来访标签" in headers) is tag_access
    assert ("来访需求" in headers) is (tag_access or detail_access)
    contents = str(list(sheet.values))
    assert (tag["name"] in contents) is tag_access
    assert ("仅详情可见的文字" in contents) is detail_access
    # 隐藏标签列之后，其余列的宽度不能错位。
    assert sheet.column_dimensions[sheet.cell(1, headers.index("目标") + 1).column_letter].width == 20


def test_visit_tags_stay_on_their_own_visit_and_deduplicate_visible_notes(client, created_customer, monkeypatch):
    visits = [client.post("/api/visits", json={"visit_date": day, "customer_id": created_customer["id"]}).json()
              for day in ("2099-10-22", "2099-10-23")]
    now = datetime.now(timezone.utc)
    notes = {}
    for note_id, visit, name, deleted in (
        ("one", visits[0], "本次标签", False), ("duplicate", visits[0], "本次标签", False),
        ("extra", visits[0], "第二标签", False), ("removed", visits[0], "已删除标签", True),
        ("other-day", visits[1], "其他日期的标签", False),
    ):
        notes[note_id] = visit_note_service.VisitNote(id=note_id, visit_id=visit["id"], category="visit_need",
            content="", need_tags=[{"id": note_id, "name": name}], created_by=note_id,
            created_at=now, updated_at=now, is_deleted=deleted)
    monkeypatch.setattr(visit_note_service, "_notes", notes)
    response = client.get("/api/visits/export", params={"date": "2099-10-22"})
    assert response.status_code == 200, response.text
    sheet = load_workbook(BytesIO(response.content)).active
    headers = [cell.value for cell in sheet[1]]
    text = sheet.cell(2, headers.index("来访标签") + 1).value
    assert set(text.split("、")) == {"本次标签", "第二标签"}
    assert text.count("本次标签") == 1
    assert "其他日期的标签" not in str(list(sheet.values))
    assert "已删除标签" not in str(list(sheet.values))
