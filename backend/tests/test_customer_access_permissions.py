"""客户数据范围、隐私字段与详情内容权限。"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services import (
    customer_access_service,
    customer_service,
    position_edit_permission_service,
)


def _customer(
    customer_id: str,
    *,
    referrer: str = "",
    referrer_handler: str = "",
):
    return SimpleNamespace(
        id=customer_id,
        referrer=referrer,
        referrer_handler=referrer_handler,
    )


def _request(*, owner: str = "引流员工", role: str = "引流角色"):
    return SimpleNamespace(
        state=SimpleNamespace(user_owner=owner, user_name=owner, user_role=role)
    )


def _permissions(
    *,
    scope: str = "related",
    referrer: bool = True,
    referrer_handler: bool = False,
    transaction_access: str = "summary",
):
    return {
        "scope": scope,
        "relations": {
            "referrer": referrer,
            "referrer_handler": referrer_handler,
        },
        "sensitive_fields": {
            "visit_purpose": True,
            "trauma_history": False,
            "current_block": False,
            "work_info": True,
            "other_info": False,
        },
        "detail_tabs": {
            "follow_up": True,
            "communication": False,
            "activities": True,
            "customer_followups": False,
            "card_statistics": True,
            "offline_courses": False,
        },
        "transaction_access": transaction_access,
    }


def test_related_scope_can_be_configured_by_referrer_or_handler(monkeypatch):
    current = _permissions()
    monkeypatch.setattr(
        customer_access_service,
        "get_customer_permissions",
        lambda _role: current,
    )
    request = _request()
    customers = [
        _customer("by-referrer", referrer="引流员工"),
        _customer("by-handler", referrer_handler="引流员工"),
        _customer("unrelated", referrer="其他人", referrer_handler="其他人"),
    ]

    assert [item.id for item in customer_access_service.filter_customers(request, customers)] == [
        "by-referrer"
    ]

    current = _permissions(referrer=False, referrer_handler=True)
    assert [item.id for item in customer_access_service.filter_customers(request, customers)] == [
        "by-handler"
    ]

    current = _permissions(referrer=True, referrer_handler=True)
    assert customer_access_service.visible_customer_ids(request, customers) == {
        "by-referrer",
        "by-handler",
    }


def test_sensitive_fields_are_removed_as_configured(monkeypatch):
    monkeypatch.setattr(
        customer_access_service,
        "get_customer_permissions",
        lambda _role: _permissions(),
    )
    protected = customer_access_service.protect_sensitive_data(
        {
            "tags": "到访目的",
            "basic_info": "创伤经历",
            "assessment": "当下卡点-PC",
            "core_situation": "当下卡点-小程序",
            "work_status": "工作情况",
            "work_description": "工作说明",
            "other_info": "其他信息",
        },
        "引流角色",
    )

    assert protected["tags"] == "到访目的"
    assert protected["work_status"] == "工作情况"
    assert protected["work_description"] == "工作说明"
    assert protected["basic_info"] == ""
    assert protected["assessment"] == ""
    assert protected["core_situation"] == ""
    assert protected["other_info"] == ""


def test_detail_tabs_and_transaction_levels_are_independent(monkeypatch):
    current = _permissions(transaction_access="summary")
    monkeypatch.setattr(
        customer_access_service,
        "get_customer_permissions",
        lambda _role: current,
    )

    assert customer_access_service.can_view_detail_tab("引流角色", "follow_up") is True
    assert customer_access_service.can_view_detail_tab("引流角色", "communication") is False
    assert customer_access_service.can_view_transaction_summary("引流角色") is True
    assert customer_access_service.can_view_detail_tab("引流角色", "transactions") is False

    current = _permissions(transaction_access="detail")
    assert customer_access_service.can_view_detail_tab("引流角色", "transactions") is True

    current = _permissions(transaction_access="none")
    try:
        customer_access_service.require_transaction_access(_request())
    except HTTPException as exc:
        assert exc.status_code == 403
    else:
        raise AssertionError("无交易权限时应拒绝访问")


def test_legacy_role_without_customer_access_keeps_previous_visibility():
    normalized = position_edit_permission_service._normalize_permissions(
        {
            "visits": "own",
            "activities": "own",
            "contacts": {},
        }
    )

    assert normalized["customer_access"]["scope"] == "all"
    assert normalized["customer_access"]["transaction_access"] == "detail"
    assert all(normalized["customer_access"]["sensitive_fields"].values())
    assert all(normalized["customer_access"]["detail_tabs"].values())


def test_cross_page_records_and_customer_search_follow_same_scope(monkeypatch):
    current = _permissions()
    customers = [
        _customer("visible", referrer="引流员工"),
        _customer("hidden", referrer="其他人"),
    ]
    monkeypatch.setattr(
        customer_access_service,
        "get_customer_permissions",
        lambda _role: current,
    )
    monkeypatch.setattr(customer_service, "list_all_customers", lambda: customers)
    request = _request()

    assert customer_access_service.filter_record_dicts(
        request,
        [{"customer_id": "visible"}, {"customer_id": "hidden"}],
    ) == [{"customer_id": "visible"}]
    assert customer_access_service.filter_customer_search_results(
        request,
        [{"id": "visible"}, {"id": "hidden"}],
    ) == [{"id": "visible"}]


def test_activity_updates_keep_old_hidden_relations_but_reject_new_ones(monkeypatch):
    current = _permissions()
    customers = [
        _customer("visible", referrer="引流员工"),
        _customer("hidden", referrer="其他人"),
        _customer("new-hidden", referrer="其他人"),
    ]
    monkeypatch.setattr(
        customer_access_service,
        "get_customer_permissions",
        lambda _role: current,
    )
    monkeypatch.setattr(customer_service, "list_all_customers", lambda: customers)
    request = _request()

    customer_access_service.require_new_customer_ids(
        request,
        ["visible", "hidden"],
        existing_ids=["hidden"],
        action="添加",
    )
    with pytest.raises(HTTPException) as exc_info:
        customer_access_service.require_new_customer_ids(
            request,
            ["visible", "new-hidden"],
            action="添加",
        )
    assert exc_info.value.status_code == 403
