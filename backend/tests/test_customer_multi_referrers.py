"""多人引流：持久化兼容、独立权限与筛选统计共用真实关系。"""

import asyncio
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api import customer_detail, customers
from app.middleware.operation_logging import build_change_description
from app.models.custom_analysis import AnalysisCondition
from app.models.customer import CustomerCreate, CustomerUpdate, customer_referrers
from app.services import custom_analysis_service as analysis
from app.services import customer_access_service as access
from app.services import customer_service, position_edit_permission_service
from app.services.principal_mobile_service import overview_metrics, selected_customers
from app.services.storage import load_item


def test_array_normalizes_and_old_single_name_with_punctuation_stays_whole():
    old = CustomerCreate(nickname="客户", referrer="甲、乙")
    assert old.referrers == ["甲、乙"]
    new = CustomerCreate(nickname="客户", referrer="不能作为权限来源", referrers=[" 甲 ", "乙", "甲"])
    assert new.referrers == ["甲", "乙"] and new.referrer == "甲、乙"
    assert customer_referrers(new.model_dump()) == ["甲", "乙"]
    assert CustomerCreate(nickname="客户", referrer="甲", referrers=[]).referrer == ""
    for invalid in (None, [""], ["a" * 51], [f"人{i}" for i in range(21)]):
        with pytest.raises(ValidationError):
            CustomerUpdate(referrers=invalid)


def test_multi_referrers_persist_edit_clear_and_keep_legacy_updates(client, created_customer):
    cid = created_customer["id"]
    changed = client.patch(f"/api/customers/{cid}", json={"referrers": ["甲", "乙", "甲"]})
    assert changed.status_code == 200, changed.text
    assert changed.json()["referrers"] == ["甲", "乙"]
    assert changed.json()["referrer"] == "甲、乙"
    stored = load_item("customers.json", cid)
    assert stored["referrers"] == ["甲", "乙"]
    assert customer_service.Customer(**stored).referrers == ["甲", "乙"]
    for payload in ({"name": "修改其他字段"}, {"referrer": "甲、乙"}):
        assert client.patch(f"/api/customers/{cid}", json=payload).json()["referrers"] == ["甲", "乙"]
    for name in ("甲", "乙"):
        rows = client.get("/api/customers", params={"referrers": name}).json()
        assert cid in {row["id"] for row in rows}
    assert cid not in {row["id"] for row in client.get("/api/customers", params={"referrers": "甲乙"}).json()}
    light = next(row for row in client.get("/api/customers/light?purpose=selector").json() if row["id"] == cid)
    assert light["referrers"] == ["甲", "乙"]
    assert client.patch(f"/api/customers/{cid}", json={"referrers": ["乙"]}).json()["referrer"] == "乙"
    assert client.patch(f"/api/customers/{cid}", json={"referrers": []}).json()["referrer"] == ""
    assert client.patch(f"/api/customers/{cid}", json={"referrer": "旧版录入"}).json()["referrers"] == ["旧版录入"]


def test_each_referrer_can_read_but_not_bypass_privacy_or_detail_scope(monkeypatch, created_customer):
    cid = created_customer["id"]
    customer = customer_service.update_customer(cid, CustomerUpdate(referrers=["引流甲", "引流乙"], basic_info="隐藏隐私", tags="可见目的"))
    permissions = position_edit_permission_service._empty_customer_access()
    permissions["scope"] = "related"
    permissions["relations"]["referrer"] = True
    permissions["sensitive_fields"]["visit_purpose"] = True
    monkeypatch.setattr(access, "get_customer_permissions", lambda _: permissions)
    for name in ("引流甲", "引流乙"):
        request = NS(state=NS(user_role="普通角色", user_owner=name, user_name=name))
        assert access.visible_customer_ids(request, [customer]) == {cid}
        result = asyncio.run(customers.get_customer(cid, request))
        assert result["basic_info"] == "" and result["tags"] == "可见目的"
        detail = customer_detail.get_customer_detail(cid, request, section="basic")
        assert detail["customer"]["basic_info"] == ""
        assert detail["payment_records"] == []
    outsider = NS(state=NS(user_role="普通角色", user_owner="引流", user_name="引流"))
    with pytest.raises(HTTPException) as error:
        asyncio.run(customers.get_customer(cid, outsider))
    assert error.value.status_code == 403
    permissions["relations"]["referrer"] = False
    assert not access.can_view_customer("普通角色", "引流乙", customer)
    permissions["relations"]["referrer"] = True
    customer_service.update_customer(cid, CustomerUpdate(referrers=["引流乙"]))
    assert not access.can_view_customer("普通角色", "引流甲", customer)
    assert access.can_view_customer("普通角色", "引流乙", customer)


def test_referrer_analysis_membership_and_shared_customer_totals_are_not_doubled():
    row = {"referrer": "甲、乙", "_referrers": ["甲", "乙"]}
    for name in ("甲", "乙"):
        assert analysis.matches_condition(row, AnalysisCondition(field="referrer", operator="eq", value=name))
    assert not analysis.matches_condition(row, AnalysisCondition(field="referrer", operator="eq", value="甲、乙"))
    customer = {"id": "shared", "deals": 2, "invite_count": 3, "arrive_count": 2,
                "products": [{"key": "membership", "label": "会员卡", "count": 2}]}
    breakdown = {"traffic": [{"label": name, "customers": [customer]} for name in ("甲", "乙")]}
    rows = selected_customers(breakdown, [])
    assert len(rows) == 1 and rows[0]["referrer"] == "甲、乙"
    assert selected_customers(breakdown, ["traffic:乙"])[0]["referrer"] == "乙"
    totals = overview_metrics(breakdown, [])
    assert totals["traffic_count"] == 1 and totals["traffic_deals"] == 2
    assert totals["invite"]["arrive_count"] == {"times": 2, "people": 1}
    description = build_change_description({"referrers": ["甲"]}, {"referrer": "甲、乙", "referrers": ["甲", "乙"]})
    assert "引流人：+乙" == description
    assert description.count("引流人") == 1
    assert build_change_description({"referrers": ["甲", "乙"]}, {"referrers": ["乙"]}) == "引流人：-甲"
