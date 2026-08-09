def test_offline_course_attendance_matches_validity_without_duplicates(
    client,
    created_customer,
):
    """线下落地课程上课次数按有效期归属，重叠区间只匹配最近生效的一笔。"""
    customer_id = created_customer["id"]
    nickname = created_customer["nickname"]
    course_ids: list[str] = []
    record_ids: list[str] = []

    try:
        for effective_date, validity_value in (("2026-01-01", 3), ("2026-03-01", 2)):
            response = client.post("/api/offline-courses", json={
                "customer_id": customer_id,
                "nickname": nickname,
                "effective_date": effective_date,
                "validity_value": validity_value,
            })
            assert response.status_code == 200
            course_ids.append(response.json()["id"])

        for record_date in (
            "2025-12-31",  # 不在任何有效期
            "2026-02-01",  # 第一笔
            "2026-03-15",  # 有效期重叠，归入最近生效的第二笔
            "2026-04-20",  # 第二笔
            "2026-05-02",  # 已超出两笔有效期
        ):
            response = client.post("/api/offline-course-records", json={
                "customer_id": customer_id,
                "customer_nickname": nickname,
                "record_date": record_date,
                "teacher": "测试老师",
                "content": "测试课程",
                "result": "完成",
            })
            assert response.status_code == 200
            record_ids.append(response.json()["id"])

        detail_response = client.get(f"/api/customer-detail/{customer_id}")
        assert detail_response.status_code == 200
        offline_items = {
            item["effective_date"]: item
            for item in detail_response.json()["purchase_summary"]
            if item["type"] == "线下落地课程"
        }
        assert offline_items["2026-01-01"]["attended_count"] == 1
        assert offline_items["2026-03-01"]["attended_count"] == 2
    finally:
        for record_id in record_ids:
            client.delete(f"/api/offline-course-records/{record_id}")
        for course_id in course_ids:
            client.delete(f"/api/offline-courses/{course_id}")
