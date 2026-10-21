import io
from types import SimpleNamespace
from unittest.mock import Mock

from openpyxl import load_workbook


def test_export_keeps_coarse_deductions_separate(client, created_customer, monkeypatch):
    from app.services import payment_export_service as service

    common = {"customer_id": created_customer["id"], "nickname": created_customer["nickname"],
              "deal_date": "2026-09-01", "created_at": "2026-09-01T10:00:00"}
    cards = [Mock(model_dump=Mock(return_value={**common, "card_type": name}))
             for name in ("次卡", "粗门次卡")]
    deduction = SimpleNamespace(
        project_name="粗门次卡",
        model_dump=lambda **kwargs: {**common, "deduction_date": "2026-09-16", "count": 2,
                                    "source_activity_name": "潜意识绘画", "remaining_after": 3},
    )
    monkeypatch.setattr(service.project_deduction_service, "list_deductions", lambda **kwargs: [deduction])
    monkeypatch.setattr(service, "fill_effective_remaining", lambda item, kind: item.update(effective_remaining=4))
    monkeypatch.setattr(service, "EXPORT_SOURCES", (
        ("membership_card", "会员卡", lambda: cards),
        ("coarse_door_card", "粗门次卡", service._coarse_records),
    ))

    def exported_rows(**params):
        response = client.get("/api/payment-exports/export", params=params)
        assert response.status_code == 200, response.text if response.status_code != 200 else ""
        return list(load_workbook(io.BytesIO(response.content)).active.iter_rows(values_only=True))[1:]

    rows = exported_rows(types="membership_card")
    assert [(row[1], row[3]) for row in rows] == [("会员卡", "次卡")]
    rows = exported_rows(types="coarse_door_card", range_type="day", period="2026-09-16")
    assert [(row[0], row[1], row[3], row[4], row[5]) for row in rows] == [
        ("2026-09-16", "粗门次卡", "潜意识绘画", "2次", "3次")]
    assert len(exported_rows()) == 2
    response = client.get("/api/payment-exports/export", params={
        "types": "coarse_door_card", "range_type": "day", "period": "2026-09-01"})
    assert response.status_code == 404


def test_payment_export_contains_all_types_and_sorts_by_deal_date(client, created_customer):
    card_id = ""
    group_case_id = ""
    deduction_id = ""
    try:
        card_response = client.post("/api/membership-cards", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "card_type": "次卡",
            "price": 198,
            "effective_date": "2026-08-01",
            "duration_type": "month",
            "duration_value": 1,
            "total_count": 1,
            "remaining_count": 1,
            "deal_date": "2026-08-01",
        })
        assert card_response.status_code == 200
        card_id = card_response.json()["id"]

        group_case_response = client.post("/api/group-cases", json={
            "customer_id": created_customer["id"],
            "nickname": created_customer["nickname"],
            "purchase_count": 2,
            "amount": 799,
            "deal_date": "2026-08-09",
        })
        assert group_case_response.status_code == 200
        group_case_id = group_case_response.json()["id"]

        deduction_response = client.post("/api/project-deductions", json={
            "customer_id": created_customer["id"],
            "project_type": "membership-cards",
            "project_id": card_id,
            "count": 1,
            "reason": "核对导出剩余次数",
        })
        assert deduction_response.status_code == 200, deduction_response.text
        deduction_id = deduction_response.json()["id"]

        export_response = client.get("/api/payment-exports/export")
        assert export_response.status_code == 200
        assert export_response.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        workbook = load_workbook(io.BytesIO(export_response.content))
        worksheet = workbook["全部付费记录"]
        rows = list(worksheet.iter_rows(values_only=True))
        assert rows[0][:7] == ("成交日期", "付费类型", "用户昵称", "项目内容", "数量/期限", "剩余次数", "金额")
        assert worksheet.auto_filter.ref.startswith("A1:O")

        test_rows = [row for row in rows[1:] if row[2] == created_customer["nickname"]]
        assert [row[0] for row in test_rows[:2]] == ["2026-08-09", "2026-08-01"]
        assert {row[1] for row in test_rows} >= {"会员卡", "觉醒游戏"}
        assert next(row for row in test_rows if row[1] == "会员卡")[5] == "0次"
        assert next(row for row in test_rows if row[1] == "觉醒游戏")[5] == "2次"

        selected_response = client.get(
            "/api/payment-exports/export?range_type=day&period=2026-08-09&types=group_case"
        )
        assert selected_response.status_code == 200
        selected_rows = list(
            load_workbook(io.BytesIO(selected_response.content), read_only=True)["全部付费记录"]
            .iter_rows(values_only=True)
        )
        assert [row[1] for row in selected_rows[1:]] == ["觉醒游戏"]
        assert selected_rows[1][5] == "2次"

        for invalid_types in ("", "group_case,unknown"):
            invalid_response = client.get(
                "/api/payment-exports/export",
                params={"types": invalid_types},
            )
            assert invalid_response.status_code == 400
            assert invalid_response.json()["detail"] == "请选择有效的付费项目类型"

        day_response = client.get("/api/payment-exports/export?range_type=day&period=2026-08-09")
        assert day_response.status_code == 200
        day_rows = list(
            load_workbook(io.BytesIO(day_response.content), read_only=True)["全部付费记录"]
            .iter_rows(values_only=True)
        )
        assert [row[0] for row in day_rows[1:] if row[2] == created_customer["nickname"]] == ["2026-08-09"]

        month_response = client.get("/api/payment-exports/export?range_type=month&period=2026-08")
        assert month_response.status_code == 200
        month_rows = list(
            load_workbook(io.BytesIO(month_response.content), read_only=True)["全部付费记录"]
            .iter_rows(values_only=True)
        )
        assert [row[0] for row in month_rows[1:] if row[2] == created_customer["nickname"]][:2] == [
            "2026-08-09",
            "2026-08-01",
        ]

        year_response = client.get("/api/payment-exports/export?range_type=year&period=2026")
        assert year_response.status_code == 200
        year_rows = list(
            load_workbook(io.BytesIO(year_response.content), read_only=True)["全部付费记录"]
            .iter_rows(values_only=True)
        )
        assert [row[0] for row in year_rows[1:] if row[2] == created_customer["nickname"]][:2] == [
            "2026-08-09",
            "2026-08-01",
        ]

        custom_response = client.get(
            "/api/payment-exports/export?range_type=custom&date_from=2026-08-02&date_to=2026-08-10"
        )
        assert custom_response.status_code == 200
        custom_rows = list(
            load_workbook(io.BytesIO(custom_response.content), read_only=True)["全部付费记录"]
            .iter_rows(values_only=True)
        )
        assert [row[0] for row in custom_rows[1:] if row[2] == created_customer["nickname"]] == ["2026-08-09"]

        empty_response = client.get("/api/payment-exports/export?range_type=year&period=1900")
        assert empty_response.status_code == 404
        assert empty_response.json()["detail"] == "所选时间范围内暂无付费记录"
    finally:
        if deduction_id:
            client.delete(f"/api/project-deductions/{deduction_id}")
        if group_case_id:
            client.delete(f"/api/group-cases/{group_case_id}")
        if card_id:
            client.delete(f"/api/membership-cards/{card_id}")
