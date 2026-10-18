from app.services import customer_tag_service, visit_note_service
from app.services.storage import load_item


def create_tag(client, name, category="visit_need"):
    response = client.post("/api/customer-tags", json={"name": name, "scope": "public", "category": category})
    assert response.status_code == 200, response.text
    return response.json()


def test_need_tags_are_separate_public_options(client, created_customer):
    normal = create_tag(client, "情感关系", "customer")
    need = create_tag(client, "情感关系")
    try:
        normal_ids = {tag["id"] for tag in client.get("/api/customer-tags").json()}
        need_ids = {tag["id"] for tag in client.get("/api/customer-tags?category=visit_need").json()}
        assert normal["id"] in normal_ids and need["id"] not in normal_ids
        assert need["id"] in need_ids and normal["id"] not in need_ids
        assert client.post("/api/customer-tags", json={"name": "重复", "scope": "private", "category": "visit_need"}).status_code == 409
        assert client.put(f"/api/customer-tags/customers/{created_customer['id']}", json={"tag_ids": [need["id"]]}).status_code == 403
    finally:
        for tag in (normal, need):
            client.delete(f"/api/customer-tags/{tag['id']}")


def test_multi_need_tags_save_without_text_and_keep_history(client, created_customer):
    first = create_tag(client, "亲密关系")
    second = create_tag(client, "工作压力")
    normal = create_tag(client, "不是需求", "customer")
    visit = client.post("/api/visits", json={"visit_date": "2026-10-18", "customer_id": created_customer["id"]}).json()
    note_id = None
    try:
        created = client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "visit_need", "content": "", "need_tag_ids": [first["id"], second["id"], first["id"]]})
        assert created.status_code == 200, created.text
        note_id = created.json()["id"]
        assert [tag["id"] for tag in created.json()["need_tags"]] == [first["id"], second["id"]]
        assert len(load_item("visit_notes.json", note_id)["need_tags"]) == 2
        # 重载验证持久化；邀约、课表及日报读取的旧正文汇总也包含标签。
        visit_note_service._load()
        listed = client.get("/api/visit-notes", params={"visit_id": visit["id"]}).json()
        assert next(note for note in listed if note["id"] == note_id)["need_tags"] == created.json()["need_tags"]
        row = client.get(f"/api/visits/{visit['id']}").json()
        assert "亲密关系" in row["needs"] and "工作压力" in row["needs"]
        changed = client.patch(f"/api/visit-notes/{note_id}", json={"content": "补充文字", "need_tag_ids": [second["id"]]})
        assert changed.status_code == 200, changed.text
        assert [tag["id"] for tag in changed.json()["need_tags"]] == [second["id"]]
        assert client.patch(f"/api/visit-notes/{note_id}", json={"content": "旧版修改"}).json()["need_tags"] == changed.json()["need_tags"]
        assert client.delete(f"/api/customer-tags/{second['id']}").status_code == 200
        assert client.patch(f"/api/visit-notes/{note_id}", json={"content": "继续修改", "need_tag_ids": [second["id"]]}).status_code == 200
        assert visit_note_service.get_note(note_id).need_tags[0]["name"] == "工作压力"
        invalid = client.patch(f"/api/visit-notes/{note_id}", json={"content": "不能混用客户标签", "need_tag_ids": [normal["id"]]})
        assert invalid.status_code == 400
        cleared = client.patch(f"/api/visit-notes/{note_id}", json={"content": "只保留文字", "need_tag_ids": []})
        assert cleared.status_code == 200 and cleared.json()["need_tags"] == []
        assert client.patch(f"/api/visit-notes/{note_id}", json={"content": "", "need_tag_ids": []}).status_code == 400
        # 其他类别仍必须有正文，不能借需求标签跳过。
        assert client.post("/api/visit-notes", json={"visit_id": visit["id"], "category": "customer_info", "content": "", "need_tag_ids": [first["id"]]}).status_code == 400
    finally:
        if note_id:
            client.delete(f"/api/visit-notes/{note_id}")
        client.delete(f"/api/visits/{visit['id']}")
        for tag in (first, second, normal):
            if customer_tag_service.get_tag(tag["id"]):
                client.delete(f"/api/customer-tags/{tag['id']}")


def test_reading_options_does_not_grant_configuration(client, monkeypatch):
    from app.api import customer_tags

    monkeypatch.setattr(customer_tags, "_actor", lambda _: ("staff", "员工", "普通员工", {"class-records"}))
    assert client.get("/api/customer-tags?category=visit_need").status_code == 200
    assert client.post("/api/customer-tags", json={"category": "visit_need", "scope": "public", "name": "不能配置"}).status_code == 403
