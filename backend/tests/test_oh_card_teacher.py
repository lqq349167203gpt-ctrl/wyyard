from datetime import datetime, timezone

import pytest

from app.models.oh_card_reading import OhCardReading
from app.services import oh_card_reading_service


@pytest.mark.parametrize("teacher", [None, "", "   ", "omitted"])
def test_create_requires_diagnosis_teacher(client, created_customer, teacher):
    payload = {"customer_id": created_customer["id"], "nickname": created_customer["nickname"]}
    if teacher != "omitted":
        payload["diagnosis_teacher"] = teacher
    response = client.post("/api/oh-card-readings", json=payload)
    assert response.status_code == 422
    assert "请选择诊断老师" in response.text


def test_teacher_is_saved_and_cannot_be_cleared(client, created_customer):
    response = client.post("/api/oh-card-readings", json={
        "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        "diagnosis_teacher": "  老师甲  ",
    })
    assert response.status_code == 200, response.text
    record = response.json()
    assert record["diagnosis_teacher"] == "老师甲"
    endpoint = f"/api/oh-card-readings/{record['id']}"
    for teacher in (None, "", "   "):
        result = client.patch(endpoint, json={"diagnosis_teacher": teacher})
        assert result.status_code == 400
        assert result.json()["detail"] == "请选择诊断老师"
    assert client.patch(endpoint, json={"notes": "补充备注"}).status_code == 200
    assert client.get(endpoint).json()["diagnosis_teacher"] == "老师甲"
    assert client.patch(endpoint, json={"diagnosis_teacher": " 老师乙 "}).json()["diagnosis_teacher"] == "老师乙"


def test_legacy_record_can_be_read_but_requires_teacher_before_edit(client, created_customer, monkeypatch):
    now = datetime.now(timezone.utc)
    record = OhCardReading(
        id="legacy-oh-teacher", customer_id=created_customer["id"],
        nickname=created_customer["nickname"], created_at=now, updated_at=now,
    )
    monkeypatch.setitem(oh_card_reading_service._readings, record.id, record)
    endpoint = f"/api/oh-card-readings/{record.id}"
    assert client.get(endpoint).status_code == 200
    assert client.patch(endpoint, json={"notes": "旧记录补录"}).status_code == 400
    result = client.patch(endpoint, json={"diagnosis_teacher": "老师甲", "notes": "旧记录补录"})
    assert result.status_code == 200, result.text
    assert result.json()["diagnosis_teacher"] == "老师甲"
