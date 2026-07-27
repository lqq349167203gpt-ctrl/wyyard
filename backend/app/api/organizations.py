from fastapi import APIRouter, HTTPException

from app.models.organization import OrganizationCreate
from app.services import organization_service

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("")
async def list_organizations():
    return organization_service.list_organizations()


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
