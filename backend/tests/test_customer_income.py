"""客户收入档案的保存、展示、隐私与中文日志。"""

from types import SimpleNamespace

import pytest
from app.models.customer import Customer, CustomerCreate, CustomerUpdate
from app.services import customer_access_service, customer_service, operation_log_service, principal_service
from app.services.storage import load_item
from app.utils.customer_profile import format_work_info

INCOME = {
    "income_stability": "收入稳定",
    "personal_annual_income": "10~20w",
    "household_annual_income": "50~100w",
}


def test_income_round_trip_and_log(client, created_customer):
    customer_id = created_customer["id"]
    response = client.patch(f"/api/customers/{customer_id}", json=INCOME)
    assert response.status_code == 200, response.text
    for field, value in INCOME.items():
        assert response.json()[field] == value
    detail = client.get(f"/api/customers/{customer_id}").json()
    for field, value in INCOME.items():
        assert detail[field] == value
    # 持久化载荷能按客户模型重新加载，不依赖当前页面状态。
    reloaded = Customer.model_validate(load_item(customer_service.FILENAME, customer_id))
    assert reloaded.personal_annual_income == INCOME["personal_annual_income"]
    contents = [log.content for log in operation_log_service.list_logs(section="客户资料")]
    assert any("个人年收入" in content and "10~20w" in content and "家庭年收入" in content for content in contents)
    response = client.patch(f"/api/customers/{customer_id}", json={key: None for key in INCOME})
    assert response.status_code == 200, response.text
    assert all(response.json()[key] == "" for key in INCOME)
    Customer.model_validate(customer_service.get_customer(customer_id).model_dump(mode="json"))


@pytest.mark.parametrize("field", list(INCOME))
def test_income_rejects_non_option_values(field):
    for model, extra in ((CustomerCreate, {"nickname": "收入测试"}), (CustomerUpdate, {})):
        with pytest.raises(ValueError):
            model.model_validate({**extra, field: "任意金额"})


def test_old_customer_income_is_empty_and_creation_accepts_options():
    assert CustomerCreate(nickname="旧客户").income_stability == ""
    assert CustomerCreate(nickname="新客户", **INCOME).household_annual_income == "50~100w"


def test_income_follows_work_info_privacy(monkeypatch):
    monkeypatch.setattr(customer_access_service, "get_customer_permissions", lambda _role: {
        "sensitive_fields": {key: False for key in customer_access_service.SENSITIVE_FIELD_MAP},
    })
    protected = customer_access_service.protect_sensitive_data(INCOME, "普通角色")
    assert all(protected[field] == "" for field in INCOME)
    assert all(not customer_access_service.can_view_sensitive_field("普通角色", field) for field in INCOME)


def test_income_in_shared_work_info_and_principal_detail():
    customer = SimpleNamespace(work_status="在职", work_description="设计", **INCOME)
    work_info = format_work_info(customer)
    assert work_info == "在职 · 设计 · 收入稳定 · 个人年收入：10~20w · 家庭年收入：50~100w"
    assert principal_service._profile_field_values(customer, ["work_info"])["work_info"] == work_info
    assert principal_service._profile_field_values(customer, []) == {}


def test_income_read_and_write_are_blocked_with_work_info(client, created_customer, monkeypatch):
    customer_id = created_customer["id"]
    assert client.patch(f"/api/customers/{customer_id}", json=INCOME).status_code == 200
    permissions = customer_access_service.get_customer_permissions("超级管理员")
    permissions["sensitive_fields"]["work_info"] = False
    monkeypatch.setattr(customer_access_service, "get_customer_permissions", lambda _role: permissions)
    detail = client.get(f"/api/customers/{customer_id}").json()
    assert all(detail[field] == "" for field in INCOME)
    denied = client.patch(f"/api/customers/{customer_id}", json={"personal_annual_income": "50w以上"})
    assert denied.status_code == 403
    assert customer_service.get_customer(customer_id).personal_annual_income == INCOME["personal_annual_income"]
