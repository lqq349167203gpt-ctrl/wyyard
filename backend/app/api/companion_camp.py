from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import ValidationError

from app.models.companion_camp import CompanionCampCreate
from app.services import (
    companion_camp_service,
    customer_access_service,
    customer_service,
    organization_service,
    position_edit_permission_service,
    sales_access_service,
)
from app.utils.payment_list import payment_list_response
from app.utils.payment_validation import ensure_payment_closer_required
from app.utils.record_ownership import ensure_payment_record_manager, stamp_payment_creator
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/companion-camps", tags=["陪伴营"])


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
    items = sales_access_service.filter_records(
        request, [item.model_dump() for item in companion_camp_service.list_records()]
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
    item = companion_camp_service.get_record(record_id)
    if not item:
        raise HTTPException(404, "记录不存在")
    sales_access_service.require_view(request, item)
    return item


@router.get("/{record_id}")
def get_record(record_id: str, request: Request):
    return sales_access_service.decorate(request, _record(request, record_id))


@router.post("")
def create_record(data: CompanionCampCreate, request: Request):
    customer_access_service.require_transaction_access(request, detail=True)
    permissions = position_edit_permission_service.get_permissions(get_request_roles(request))
    if permissions["payments"] == "view" and permissions.get("payment_rules") is None:
        raise HTTPException(403, "当前角色只能查看付费记录")
    sales_access_service.require_create(request, data)
    from app.utils.default_organization import payment_organization_id

    data.organization_id = payment_organization_id()
    organization = organization_service.get_organization(data.organization_id)
    if not organization or organization.status == "archived":
        raise HTTPException(400, "请选择运营中的成交归属组织")
    ensure_payment_closer_required(data)
    from app.services.payment_course_service import normalize_course
    normalize_course(data, request=request)
    return companion_camp_service.create_record(stamp_payment_creator(data, request))


@router.patch("/{record_id}")
def update_record(record_id: str, data: dict, request: Request):
    existing = _record(request, record_id)
    ensure_payment_record_manager(request, existing)
    data.pop("created_by", None)
    data.pop("created_by_id", None)
    data.pop("entry_course_key", None)
    from app.services.payment_course_service import normalize_course
    normalize_course(data, existing, request)
    ensure_payment_closer_required(data, existing)
    if data.get("customer_id"):
        sales_access_service.require_create(request, {**existing.model_dump(), **data})
    if data.get("organization_id") and data["organization_id"] != existing.organization_id:
        organization = organization_service.get_organization(data["organization_id"])
        if not organization or organization.status == "archived":
            raise HTTPException(400, "请选择运营中的成交归属组织")
    try:
        return companion_camp_service.update_record(record_id, data)
    except ValidationError:
        raise HTTPException(400, "请填写有效的成交日期、生效日期、用户、成交归属、陪伴老师和正整数天或月有效期")


@router.delete("/{record_id}")
def delete_record(record_id: str, request: Request):
    ensure_payment_record_manager(request, _record(request, record_id))
    companion_camp_service.delete_record(record_id)
    return {"message": "删除成功"}
