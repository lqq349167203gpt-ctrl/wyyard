"""客户数据范围、隐私字段与详情内容权限。"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.middleware.jwt_auth import _get_read_only_area
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


def test_edit_scope_normalization_keeps_legacy_roles_editable_and_accepts_view_only():
    legacy = position_edit_permission_service._normalize_permissions({
        "visits": "own",
        "activities": "all",
    })
    assert legacy["customers"] == "all"
    assert legacy["visits"] == "own"
    assert legacy["activities"] == "all"

    view_only = position_edit_permission_service._normalize_permissions({
        "customers": "view",
        "visits": "view",
        "activities": "view",
    })
    assert view_only["customers"] == "view"
    assert view_only["visits"] == "view"
    assert view_only["activities"] == "view"


@pytest.mark.parametrize(("path", "area"), [
    ("/api/customers/customer-id", "customers"),
    ("/api/customer-tags/customers/customer-id", "customers"),
    ("/api/visits/visit-id", "visits"),
    ("/api/visit-notes", "visits"),
    ("/api/class-records/record-id/withdrawals", "activities"),
    ("/api/activity-themes", "activities"),
])
def test_write_routes_are_mapped_to_read_only_area(path, area):
    assert _get_read_only_area(path, "POST") == area


def test_read_like_customer_posts_remain_available_in_view_only_mode():
    assert _get_read_only_area("/api/customers/batch", "POST") == ""
    assert _get_read_only_area("/api/customers/customer-id/contact-access", "POST") == ""
    assert _get_read_only_area("/api/customers/customer-id", "GET") == ""


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


@pytest.mark.parametrize("external", [False, True])
def test_principal_participant_profile_keeps_privacy_and_detail_permissions(monkeypatch, external):
    from app.api import customer_detail
    from app.services import communication_record_service, position_permission_service, principal_service

    permissions = _permissions(scope="related", transaction_access="none")
    permissions["detail_tabs"] = {key: False for key in permissions["detail_tabs"]}
    permissions["sensitive_fields"] = {key: False for key in permissions["sensitive_fields"]}
    public = _permissions(transaction_access="detail") if external else permissions
    if external:
        public["sensitive_fields"] = {key: True for key in public["sensitive_fields"]}
        public["detail_tabs"] = {key: True for key in public["detail_tabs"]}
    customer = SimpleNamespace(id="participant", nickname="参与者", is_deleted=False,
                               referrer="其他人", referrer_handler="")
    customer.model_dump = lambda **_: {
        "id": customer.id, "nickname": customer.nickname, "tags": "隐私",
        "basic_info": "隐私", "assessment": "隐私", "core_situation": "隐私",
        "work_status": "隐私", "work_description": "隐私", "other_info": "隐私",
    }
    monkeypatch.setattr(customer_service, "get_customer", lambda _: customer)
    monkeypatch.setattr(customer_access_service, "get_customer_permissions", lambda _: public)
    monkeypatch.setattr(position_edit_permission_service, "get_permissions", lambda _: {"principal_external_access": permissions})
    monkeypatch.setattr(position_permission_service, "get_permissions", lambda _: ["principal"])
    # 内部人员＝被该组织的引流人引流来的客户：内部时把「其他人」配成该组织的引流人
    org = SimpleNamespace(id="org", member_ids=[] if external else ["referrer"], referrer_mode="member")
    course = {"id": "lesson", "organization_id": "org", "organization": "组织", "name": "课程", "participant_ids": [customer.id]}
    monkeypatch.setattr(principal_service, "collect_data", lambda _: ([org], {}, [], [course]))
    monkeypatch.setattr(principal_service, "scope", lambda _: (
        [org],
        {customer.id: customer, "referrer": SimpleNamespace(id="referrer", nickname=customer.referrer, name="")},
        {},
    ))
    monkeypatch.setattr(customer_detail.customer_contact_service, "protect_customer_data", lambda data, *_, **__: data)
    monkeypatch.setattr(customer_detail.visit_service, "count_customer_visits", lambda _: 0)
    monkeypatch.setattr(customer_detail.visit_service, "list_visits", lambda **_: [])

    def forbidden(*args, **kwargs):
        raise AssertionError("未授权详情不应读取")

    for name in ("_build_purchase_summary", "_build_activities", "_build_payment_records", "_build_offline_course_records"):
        monkeypatch.setattr(customer_detail, name, forbidden)
    request = _request()
    # 普通详情入口仍然受客户资料范围限制。
    with pytest.raises(HTTPException) as denied:
        customer_detail.get_customer_detail(customer.id, request)
    assert denied.value.status_code == 403
    result = customer_detail.get_customer_detail(customer.id, request, principal_participant=True, principal_course="lesson")
    for fields in customer_access_service.SENSITIVE_FIELD_MAP.values():
        assert all(result["customer"][field] == "" for field in fields)
    for key in ("purchase_summary", "activities", "activity_followups", "activity_participant_notes",
                "healing_records", "payment_records", "offline_course_records", "visit_records", "communication_records"):
        assert result[key] == []
    assert result["customer"]["transaction_count"] is None
    permissions["detail_tabs"]["communication"] = True
    permissions["sensitive_fields"]["visit_purpose"] = True
    record = SimpleNamespace(customer_id=customer.id, customer_nickname=customer.nickname,
                             model_dump=lambda **_: {"id": "note", "content": "允许查看的沟通"})
    other = SimpleNamespace(customer_id="other", customer_nickname=customer.nickname)
    monkeypatch.setattr(communication_record_service, "list_records", lambda: [record, other])
    allowed = customer_detail.get_customer_detail(customer.id, request, principal_participant=True, principal_course="lesson")
    assert allowed["customer"]["tags"] == "隐私"
    assert allowed["customer"]["basic_info"] == ""
    assert allowed["communication_records"] == [{"id": "note", "content": "允许查看的沟通", "can_edit": False, "can_delete": False}]
    with pytest.raises(HTTPException):
        customer_detail.get_customer_detail(customer.id, request, principal_participant=True, principal_course="foreign-course")
    # 同一资料请求不获得编辑/关联客户权限。
    with pytest.raises(HTTPException):
        customer_access_service.require_customer_scope(request, customer.id, action="修改")
    # 伪造入口标记：不在可见课程中、或没有页面权限都不能放行。
    monkeypatch.setattr(principal_service, "collect_data", lambda _: ([], {}, [], []))
    with pytest.raises(HTTPException) as denied:
        customer_detail.get_customer_detail(customer.id, request, principal_participant=True)
    assert denied.value.status_code == 403
    monkeypatch.setattr(position_permission_service, "get_permissions", lambda _: [])
    with pytest.raises(HTTPException) as denied:
        customer_detail.get_customer_detail(customer.id, request, principal_participant=True)
    assert denied.value.status_code == 403


def test_external_permissions_persist_merge_and_audit_independently(monkeypatch):
    from app.api.position_permissions import EditPermissionUpdate
    from app.middleware.operation_logging import _format_edit_permission_changes

    service = position_edit_permission_service
    monkeypatch.setattr(service, "_permissions", {})
    saved = {}
    monkeypatch.setattr(service, "save_item", lambda _, role, value: saved.update({role: value}))
    public = service._full_customer_access()
    normalized = service._normalize_permissions({"customer_access": public})
    assert not any(normalized["principal_external_access"]["sensitive_fields"].values())
    assert normalized["principal_external_access"]["transaction_access"] == "none"
    payload = EditPermissionUpdate(principal_external_access={"sensitive_fields": {"visit_purpose": True}}).model_dump(exclude_none=True)
    first = service.set_permissions("external-a", payload)
    assert saved["external-a"]["principal_external_access"]["sensitive_fields"]["visit_purpose"]
    # 老端保存其他选项不应覆盖独立权限。
    service.set_permissions("external-a", {"customer_access": public})
    second = service.set_permissions("external-b", {"principal_external_access": {"detail_tabs": {"activities": True}}})
    merged = service.get_permissions(["external-a", "external-b"])["principal_external_access"]
    assert merged["sensitive_fields"]["visit_purpose"] and merged["detail_tabs"]["activities"]
    assert not merged["sensitive_fields"]["trauma_history"]
    assert not merged["detail_tabs"]["communication"]
    changes = _format_edit_permission_changes({}, first)
    assert "组织/俱乐部外部客户到访目的查看权限(开启)" in changes
    assert "组织/俱乐部外部客户活动记录查看权限(开启)" in _format_edit_permission_changes({}, second)


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
