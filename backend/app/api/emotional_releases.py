from fastapi import APIRouter, HTTPException
from app.services import emotional_release_service
from app.models.emotional_release import EmotionalReleaseCreate

router = APIRouter(prefix="/api/emotional-releases", tags=["emotional-releases"])


@router.get("")
def list_releases():
    return emotional_release_service.list_releases()


@router.post("")
def create_release(data: EmotionalReleaseCreate):
    return emotional_release_service.create_release(data)


@router.patch("/{release_id}")
def update_release(release_id: str, data: dict):
    release = emotional_release_service.update_release(release_id, data)
    if not release:
        raise HTTPException(status_code=404, detail="记录不存在")
    return release


@router.delete("/{release_id}")
def delete_release(release_id: str):
    success, message = emotional_release_service.delete_release(release_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@router.get("/search-customers")
def search_customers(q: str = ""):
    return emotional_release_service.search_customers(q)
