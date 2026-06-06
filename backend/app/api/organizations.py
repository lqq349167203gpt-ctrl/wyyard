from fastapi import APIRouter, HTTPException

from app.models.organization import OrganizationCreate
from app.services import organization_service

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("")
async def list_organizations():
    return organization_service.list_organizations()


@router.post("")
async def create_organization(data: OrganizationCreate):
    return organization_service.create_organization(data)


@router.patch("/{org_id}")
async def update_organization(org_id: str, data: dict):
    result = organization_service.update_organization(org_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="组织不存在")
    return result


@router.delete("/{org_id}")
async def delete_organization(org_id: str):
    if not organization_service.delete_organization(org_id):
        raise HTTPException(status_code=404, detail="组织不存在")
    return {"message": "已删除"}
