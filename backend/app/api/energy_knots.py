from fastapi import APIRouter, HTTPException
from app.services import energy_knot_service
from app.models.energy_knot import EnergyKnotCreate

router = APIRouter(prefix="/api/energy-knots", tags=["energy-knots"])


@router.get("")
def list_knots():
    return energy_knot_service.list_knots()


@router.post("")
def create_knot(data: EnergyKnotCreate):
    return energy_knot_service.create_knot(data)


@router.patch("/{knot_id}")
def update_knot(knot_id: str, data: dict):
    knot = energy_knot_service.update_knot(knot_id, data)
    if not knot:
        raise HTTPException(status_code=404, detail="记录不存在")
    return knot


@router.delete("/{knot_id}")
def delete_knot(knot_id: str):
    success, message = energy_knot_service.delete_knot(knot_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return energy_knot_service.search_customers(q)
