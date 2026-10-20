"""信息查看拆分：单项可见、隐藏字段编辑保护、旧配置及多角色独立合并。"""

from types import SimpleNamespace

import pytest

from app.services import customer_access_service as access
from app.services import position_edit_permission_service as permissions
from app.services import visit_note_service
from tests.test_visit_notes import _create_visit


def configured(*keys):
    result = permissions._empty_customer_access()
    result["scope"] = "all"
    for key in keys:
        result["detail_tabs"][key] = True
    return result


def test_legacy_and_explicit_permissions_merge_without_external_inheritance(monkeypatch):
    old = permissions._normalize_permissions({"customer_access": {"scope": "all", "detail_tabs": {"follow_up": True}}})
    assert all(old["customer_access"]["detail_tabs"][key] for key in access.NOTE_PERMISSION_KEYS)
    assert not any(old["principal_external_access"]["detail_tabs"][key] for key in access.NOTE_PERMISSION_KEYS)
    first = permissions._normalize_permissions({"customer_access": configured("visit_need_tags"),
                                               "principal_external_access": configured("customer_feedback")})
    second = permissions._normalize_permissions({"customer_access": configured("customer_info")})
    monkeypatch.setattr(permissions, "_permissions", {"a": first, "b": second})
    merged = permissions.get_permissions(["a", "b"])
    assert merged["customer_access"]["detail_tabs"]["visit_need_tags"]
    assert merged["customer_access"]["detail_tabs"]["customer_info"]
    assert not merged["customer_access"]["detail_tabs"]["visit_need_detail"]
    assert merged["principal_external_access"]["detail_tabs"]["customer_feedback"]
    assert not merged["principal_external_access"]["detail_tabs"]["customer_info"]
    monkeypatch.setattr(permissions, "save_item", lambda *_: None)
    saved = permissions.set_permissions("a", {"customer_access": {"scope": "all", "detail_tabs": {"follow_up": True}}})
    assert not saved["customer_access"]["detail_tabs"]["visit_need_detail"]


@pytest.mark.parametrize("allowed", [(), *( (key,) for key in access.NOTE_PERMISSION_KEYS), access.NOTE_PERMISSION_KEYS])
def test_single_field_visibility_across_visit_detail_report_and_course_entries(client, created_customer, monkeypatch, allowed):
    day = "2026-10-18"
    visit = _create_visit(client, created_customer["id"], visit_date=day)
    tag = client.post("/api/customer-tags", json={"name": f"权限标签_{visit['id']}", "scope": "public", "category": "visit_need"}).json()
    for category in ("visit_need", "customer_info", "follow_up", "customer_feedback"):
        response = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": category,
            "content": f"秘密_{category}", **({"need_tag_ids": [tag["id"]]} if category == "visit_need" else {})})
        assert response.status_code == 200, response.text
    monkeypatch.setattr(access, "get_customer_permissions", lambda _: configured(*allowed))
    notes = client.get("/api/visit-notes", params={"visit_id": visit["id"]})
    assert notes.status_code == 200, notes.text
    payloads = [notes.text]
    for path, params in [(f"/api/visits/{visit['id']}", {}), ("/api/visits", {"date": day}),
                         ("/api/visits/light", {"date": day}), ("/api/daily-report", {"date": day}),
                         (f"/api/customer-detail/{created_customer['id']}", {"section": "healing"})]:
        response = client.get(path, params=params)
        assert response.status_code == 200, (path, response.text)
        payloads.append(response.text)
        if path == "/api/visits/light":
            entries = response.json()[0]["visit_need_entries"]
            if "visit_need_tags" not in allowed and "visit_need_detail" not in allowed:
                assert entries == []
            else:
                assert entries[0]["need_tags"] == ([{"id": tag["id"], "name": tag["name"]}] if "visit_need_tags" in allowed else [])
                assert entries[0]["content"] == ("秘密_visit_need" if "visit_need_detail" in allowed else "")
            assert "visit_notes" not in response.json()[0]
    for payload in payloads:
        assert (tag["name"] in payload) == ("visit_need_tags" in allowed)
        for category in ("visit_need", "customer_info", "follow_up", "customer_feedback"):
            key = "visit_need_detail" if category == "visit_need" else category
            assert (f"秘密_{category}" in payload) == (key in allowed)
    # 课程参与者、组织明细与导出共用的投影也必须对标签和正文分别处理。
    raw = visit_note_service.group_notes_by_visit([visit["id"]])[visit["id"]]
    result = access.protect_note_payload({f"{key}_entries": value for key, value in raw.items()}, permissions=configured(*allowed))
    assert (tag["name"] in str(result)) == ("visit_need_tags" in allowed)
    assert ("秘密_visit_need" in str(result)) == ("visit_need_detail" in allowed)
    blocked = next((key for key in ("customer_info", "follow_up", "customer_feedback") if key not in allowed), None)
    if blocked:
        assert client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": blocked, "content": "越权写入"}).status_code == 403


@pytest.mark.parametrize("entry", ["visit-notes", "customer-follow-ups"])
@pytest.mark.parametrize("visible", ["visit_need_tags", "visit_need_detail"])
def test_partial_edit_preserves_hidden_part(client, created_customer, monkeypatch, entry, visible):
    visit = _create_visit(client, created_customer["id"])
    tag = client.post("/api/customer-tags", json={"name": f"隐藏标签_{visit['id']}", "scope": "public", "category": "visit_need"}).json()
    note = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "visit_need",
        "content": "必须保留的详情", "need_tag_ids": [tag["id"]]}).json()
    monkeypatch.setattr(access, "get_customer_permissions", lambda _: configured(visible))
    changed = client.patch(f"/api/{entry}/{note['id']}", json={"content": "" if visible == "visit_need_tags" else "新详情", "need_tag_ids": []})
    assert changed.status_code == 200, changed.text
    original = visit_note_service.get_note(note["id"])
    assert original.content == ("必须保留的详情" if visible == "visit_need_tags" else "新详情")
    assert bool(original.need_tags) == (visible != "visit_need_tags")
    if visible == "visit_need_tags":
        assert changed.json()["content"] == ""
        forbidden = client.patch(f"/api/{entry}/{note['id']}", json={"content": "越权覆盖"})
        assert forbidden.status_code == 403


def test_permission_api_accepts_new_fields_and_keeps_audit(client):
    role = "测试信息拆分权限"
    response = client.put("/api/position-permissions/full", json={"position": role, "pages": ["healing-records"],
        "edit_permissions": {"customer_access": configured("visit_need_tags", "customer_feedback"),
                             "principal_external_access": configured("visit_need_detail")}})
    assert response.status_code == 200, response.text
    value = client.get(f"/api/position-permissions/{role}").json()["edit_permissions"]
    assert value["customer_access"]["detail_tabs"]["visit_need_tags"]
    assert not value["customer_access"]["detail_tabs"]["visit_need_detail"]
    assert value["principal_external_access"]["detail_tabs"]["visit_need_detail"]


def test_external_customer_uses_its_own_note_fields(client, created_customer, monkeypatch):
    from app.api import customer_detail
    from app.services import principal_service

    visit = _create_visit(client, created_customer["id"])
    tag = client.post("/api/customer-tags", json={"name": "外部可见标签", "scope": "public", "category": "visit_need"}).json()
    client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "visit_need",
        "content": "外部不可见详情", "need_tag_ids": [tag["id"]]})
    client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "customer_info", "content": "公共可见深度需求"})
    value = permissions._normalize_permissions({"customer_access": configured("customer_info"),
                                              "principal_external_access": configured("visit_need_tags")})
    monkeypatch.setitem(permissions._permissions, "拆分权限角色", value)
    monkeypatch.setattr(principal_service, "require_participant_profile_access", lambda *_: True)
    request = SimpleNamespace(state=SimpleNamespace(user_role="拆分权限角色", user_owner="测试员工", user_name="测试员工"))
    result = customer_detail.get_customer_detail(created_customer["id"], request, principal_participant=True, section="healing")
    assert "外部可见标签" in str(result)
    assert "外部不可见详情" not in str(result)
    assert "公共可见深度需求" not in str(result)
