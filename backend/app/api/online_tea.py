from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import ValidationError

from app.models.online_tea import OnlineTeaCreate
from app.services import (
    customer_access_service,
    customer_service,
    online_tea_service,
    organization_service,
    position_edit_permission_service,
)
from app.utils.payment_list import payment_list_response
from app.utils.record_ownership import ensure_payment_record_manager, stamp_payment_creator
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/online-tea", tags=["线上茶疗"])


@router.get("")
def list_records(
    request: Request,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
    customer_ids: str | None = None,
    nickname: str | None = None,
    closer_name: str | None = None,
):
    customer_access_service.require_transaction_access(request, detail=True)
    items = customer_access_service.filter_record_dicts(
        request, [item.model_dump() for item in online_tea_service.list_records()]
    )
    if customer_ids:
        items = [item for item in items if item["customer_id"] in set(customer_ids.split(","))]
    if closer_name:
        items = [
            item
            for item in items
            if any(closer_name.lower() in str(closer.get("name", "")).lower() for closer in item["closers"])
            or closer_name.lower() in (item.get("closer_name") or "").lower()
        ]
    return payment_list_response(request, items, page, page_size, nickname=nickname)


@router.get("/search-customers")
def search_customers(request: Request, q: str = ""):
    customer_access_service.require_transaction_access(request, detail=True)
    people = [
        {"id": c.id, "nickname": c.nickname, "name": c.name}
        for c in customer_service.list_customers()
        if q and (q in c.nickname or q in (c.name or ""))
    ]
    return customer_access_service.filter_customer_search_results(request, people)


def _record(request, record_id):
    customer_access_service.require_transaction_access(request, detail=True)
    item = online_tea_service.get_record(record_id)
    if not item:
        raise HTTPException(404, "记录不存在")
    customer_access_service.require_customer_scope(request, item.customer_id)
    return item


@router.get("/{record_id}")
def get_record(record_id: str, request: Request):
    return _record(request, record_id)


@router.post("")
def create_record(data: OnlineTeaCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    if position_edit_permission_service.get_permissions(get_request_roles(request))["payments"] == "view":
        raise HTTPException(403, "当前角色只能查看付费记录")
    customer_access_service.require_customer_scope(request, data.customer_id, action="新增付费项目到")
    from app.utils.default_organization import payment_organization_id

    data.organization_id = payment_organization_id()
    organization = organization_service.get_organization(data.organization_id)
    if not organization or organization.status == "archived":
        raise HTTPException(400, "请选择运营中的成交归属组织")
    return online_tea_service.create_record(stamp_payment_creator(data, request))


@router.patch("/{record_id}")
def update_record(record_id: str, data: dict, request: Request):
    existing = _record(request, record_id)
    ensure_payment_record_manager(request, existing)
    if data.get("customer_id"):
        customer_access_service.require_customer_scope(request, data["customer_id"], action="新增付费项目到")
    if data.get("organization_id") and data["organization_id"] != existing.organization_id:
        organization = organization_service.get_organization(data["organization_id"])
        if not organization or organization.status == "archived":
            raise HTTPException(400, "请选择运营中的成交归属组织")
    try:
        return online_tea_service.update_record(record_id, data)
    except ValidationError:
        raise HTTPException(400, "请填写有效的成交日期、生效日期、用户、成交归属和正整数天或月有效期")


@router.delete("/{record_id}")
def delete_record(record_id: str, request: Request):
    ensure_payment_record_manager(request, _record(request, record_id))
    online_tea_service.delete_record(record_id)
    return {"message": "删除成功"}
