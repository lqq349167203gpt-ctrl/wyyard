import pytest

from app.models.custom_analysis import AnalysisCondition
from app.models.member_identity import IdentityCondition
from app.services import activity_permission_service
from app.utils.learning_course_types import LEARNING_COURSE_TYPES, LEGACY_PAYMENT_COURSE_TYPES
from app.utils.payment_types import OH_READING_TYPES


@pytest.mark.parametrize("course_type", LEARNING_COURSE_TYPES)
def test_learning_course_default_year(client, created_customer, course_type):
    response = client.post("/api/internal-courses", json={
        "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        "course_type": course_type, "price": 0, "effective_date": "2026-10-18",
    })
    assert response.status_code == 200, response.text
    course = response.json()
    assert course["course_type"] == course_type
    assert course["expiry_date"] == "2027-10-17"
    updated = client.patch(f"/api/internal-courses/{course['id']}", json={"notes": "保留有效期"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["expiry_date"] == course["expiry_date"]


def test_learning_validity_defaults_to_one_year_and_accepts_custom_months(client, created_customer):
    created = []
    for course_type in LEGACY_PAYMENT_COURSE_TYPES:
        response = client.post("/api/internal-courses", json={
            "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
            "course_type": course_type, "price": 0, "effective_date": "2026-10-18",
        })
        assert response.status_code == 200, response.text
        created.append(response.json())
        assert response.json()["validity_value"] == 12
        assert response.json()["expiry_date"] == "2027-10-17"
    custom = client.post("/api/internal-courses", json={
        "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        "course_type": LEGACY_PAYMENT_COURSE_TYPES[0], "price": 0,
        "effective_date": "2026-10-18", "validity_value": 3,
    })
    assert custom.status_code == 200, custom.text
    assert custom.json()["expiry_date"] == "2027-01-17"
    shifted = client.patch(f"/api/internal-courses/{created[0]['id']}", json={"effective_date": "2026-11-18"})
    assert shifted.status_code == 200, shifted.text
    assert shifted.json()["validity_value"] == 12
    assert shifted.json()["expiry_date"] == "2027-11-17"
    assert client.patch(f"/api/internal-courses/{custom.json()['id']}", json={"validity_value": 0}).status_code == 400


def test_old_permission_and_filter_names_compatible():
    old = {"角色": {"内部课程": {"view": False, "participate": False}}}
    assert activity_permission_service._migrate(old)["角色"]["沙龙技能学习"] == {"view": False, "participate": False}
    assert "内部课程" in old["角色"]  # 读兼容不修改原始数据
    assert IdentityCondition(type="payment", payment_categories=["内部课程"]).payment_categories == ["沙龙技能学习"]
    assert AnalysisCondition(field="payment_categories", operator="in", value=["内部课程"]).value == ["沙龙技能学习"]
    assert AnalysisCondition(field="nickname", operator="eq", value="内部课程").value == "内部课程"


@pytest.mark.parametrize("reading_type", OH_READING_TYPES)
def test_oh_subtype_roundtrip_filter_and_validation(client, created_customer, reading_type):
    response = client.post("/api/oh-card-readings", json={
        "customer_id": created_customer["id"], "nickname": created_customer["nickname"],
        "reading_type": reading_type, "diagnosis_teacher": "老师甲", "amount": 0,
    })
    assert response.status_code == 200, response.text
    reading = response.json()
    assert reading["reading_type"] == reading_type
    filtered = client.get("/api/oh-card-readings", params={"page": 1, "subtypes": f'["{reading_type}"]', "include_filter_options": "true"}).json()
    assert reading["id"] in {item["id"] for item in filtered["items"]}
    assert {item["reading_type"] for item in filtered["items"]} == {reading_type}
    assert client.patch(f"/api/oh-card-readings/{reading['id']}", json={"reading_type": "不存在"}).status_code == 400
    assert client.post("/api/oh-card-readings", json={"customer_id": created_customer["id"], "nickname": created_customer["nickname"], "reading_type": "不存在"}).status_code == 422


def test_purchase_catalog_includes_learning_and_oh_types(client):
    products = client.get("/api/upsell-config").json()["products"]
    keys = {product["key"] for product in products}
    assert {f"internal:{name}" for name in LEARNING_COURSE_TYPES + LEGACY_PAYMENT_COURSE_TYPES} <= keys
    assert {f"oh:{name}" for name in OH_READING_TYPES} <= keys
    assert next(item["label"] for item in products if item["key"] == "internal") == "沙龙技能学习"
