import uuid


def test_service_statistics_activity_count_matches_date_filtered_detail(
    client,
    created_customer,
):
    """服务数据的活动次数必须与同日期范围内的详情记录一致。"""
    suffix = uuid.uuid4().hex[:8]
    customer_id = created_customer["id"]
    visit_id = ""
    activity_ids: list[str] = []

    try:
        visit_response = client.post("/api/visits", json={
            "visit_date": "2026-08-10",
            "customer_id": customer_id,
            "arrived": True,
        })
        assert visit_response.status_code == 200
        visit_id = visit_response.json()["id"]

        for activity_date in ("2026-08-10", "2026-08-11"):
            activity_response = client.post("/api/class-records", json={
                "date": activity_date,
                "course_id": f"service-statistics-{suffix}-{activity_date}",
                "course_name": f"服务数据日期过滤测试-{activity_date}",
                "participant_ids": [customer_id],
            })
            assert activity_response.status_code == 200
            activity_ids.append(activity_response.json()["id"])

        statistics_response = client.get(
            "/api/statistics/details",
            params={
                "date_from": "2026-08-10",
                "date_to": "2026-08-10",
            },
        )
        assert statistics_response.status_code == 200
        customer_row = next(
            row
            for row in statistics_response.json()["invited"]
            if row["customer_id"] == customer_id
        )
        assert customer_row["activity_count"] == 1

        detail_response = client.get(
            f"/api/customer-detail/{customer_id}",
            params={"date": "2026-08-10"},
        )
        assert detail_response.status_code == 200
        activities = detail_response.json()["activities"]
        assert len(activities) == 1
        assert activities[0]["date"] == "2026-08-10"
    finally:
        for activity_id in activity_ids:
            client.delete(f"/api/class-records/{activity_id}")
        if visit_id:
            client.delete(f"/api/visits/{visit_id}")
