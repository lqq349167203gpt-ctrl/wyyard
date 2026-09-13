"""客户跟进页：只列自己填过的邀约备注（来访需求 / 客户信息 / 跟进点），能就地改。"""


def _create_visit(client, customer_id: str, date: str = "2026-08-23") -> dict:
    response = client.post(
        "/api/visits",
        json={"visit_date": date, "visit_time": "09:00", "customer_id": customer_id},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _save_note(client, visit_id: str, category: str, content: str) -> str:
    response = client.post(
        "/api/visit-notes",
        json={"visit_id": visit_id, "category": category, "content": content},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_customer_follow_ups_list_search_and_edit(client, created_customer):
    visit = _create_visit(client, created_customer["id"])
    note_ids = [
        _save_note(client, visit["id"], "visit_need", "想来做义工，先体验读书会"),
        _save_note(client, visit["id"], "customer_info", "做电商客服，比较紧绷"),
        _save_note(client, visit["id"], "follow_up", "三天后回访睡眠情况"),
    ]
    try:
        listed = client.get("/api/customer-follow-ups")
        assert listed.status_code == 200, listed.text
        payload = listed.json()
        assert payload["total"] == 1
        row = payload["items"][0]
        # 给谁填的、几月几号来的、当天参加的活动
        assert row["customer_id"] == created_customer["id"]
        assert row["customer_name"] == created_customer["nickname"]
        assert row["visit_date"] == "2026-08-23"
        assert isinstance(row["activities"], list)
        # 三类内容都在
        assert row["visit_need"]["content"] == "想来做义工，先体验读书会"
        assert row["customer_info"]["content"] == "做电商客服，比较紧绷"
        assert row["follow_up"]["content"] == "三天后回访睡眠情况"

        # 按昵称/姓名搜索
        hit = client.get("/api/customer-follow-ups", params={"keyword": row["customer_name"]})
        assert hit.status_code == 200 and hit.json()["total"] == 1
        miss = client.get("/api/customer-follow-ups", params={"keyword": "绝对不存在的客户名字"})
        assert miss.status_code == 200 and miss.json()["total"] == 0

        # 就地把「跟进点」改掉
        updated = client.patch(
            f"/api/customer-follow-ups/{row['follow_up']['id']}",
            json={"content": "改后的跟进点：已约周五面谈"},
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["content"] == "改后的跟进点：已约周五面谈"
        again = client.get("/api/customer-follow-ups").json()["items"][0]
        assert again["follow_up"]["content"] == "改后的跟进点：已约周五面谈"
        assert again["visit_need"]["content"] == "想来做义工，先体验读书会"

        # 空内容不接受
        blank = client.patch(
            f"/api/customer-follow-ups/{row['follow_up']['id']}",
            json={"content": "   "},
        )
        assert blank.status_code == 400

        # 操作日志里留下这次修改（使用统计的操作明细读同一份）
        logs = client.get("/api/operation-logs", params={"section": "客户跟进"})
        assert logs.status_code == 200, logs.text
        assert any("改后的跟进点" in (item.get("content") or "") for item in logs.json())
    finally:
        for note_id in note_ids:
            client.delete(f"/api/visit-notes/{note_id}")
