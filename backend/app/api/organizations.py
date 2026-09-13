from fastapi import APIRouter, HTTPException

from app.models.organization import OrganizationCreate, OrganizationDataViewersUpdate
from app.services import customer_service, organization_data_viewer_service, organization_service

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("")
async def list_organizations():
    organizations = organization_service.list_organizations()
    # 组织成员/引流人的名字由服务端解析：配置页面不应受「客户资料可见范围」影响，
    # 否则范围窄的账号会把成员全部显示成「已删除」。
    customers = {customer.id: customer for customer in customer_service.list_customers()}

    def resolve(customer_id: str) -> dict:
        customer = customers.get(customer_id)
        return {
            "id": customer_id,
            "nickname": (customer.nickname or customer.name or "") if customer else "",
            "name": (customer.name or "") if customer else "",
            "member_type": (customer.member_type or "") if customer else "",
            "visit_count": customer.visit_count if customer else 0,
            "missing": customer is None,
        }

    return [
        {
            **organization.model_dump(mode="json"),
            "members": [resolve(customer_id) for customer_id in organization.member_ids],
            "referrers": [resolve(customer_id) for customer_id in (organization.referrer_ids or [])],
            "data_viewers": [
                resolve(customer_id)
                for customer_id in organization_data_viewer_service.list_data_viewer_ids()
            ],
        }
        for organization in organizations
    ]


@router.get("/data-viewers")
async def get_data_viewers():
    return {"data_viewer_ids": organization_data_viewer_service.list_data_viewer_ids()}


@router.put("/data-viewers")
async def set_data_viewers(data: OrganizationDataViewersUpdate):
    return {"data_viewer_ids": organization_data_viewer_service.set_data_viewer_ids(data.data_viewer_ids)}


@router.post("")
async def create_organization(data: OrganizationCreate):
    try:
        return organization_service.create_organization(data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/{org_id}")
async def update_organization(org_id: str, data: dict):
    try:
        result = organization_service.update_organization(org_id, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="组织不存在")
    return result


@router.delete("/{org_id}")
async def delete_organization(org_id: str):
    try:
        deleted = organization_service.delete_organization(org_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="组织不存在")
    return {"message": "已删除"}
