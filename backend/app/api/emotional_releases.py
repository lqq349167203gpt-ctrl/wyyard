from fastapi import APIRouter, HTTPException, Query
from app.utils.pagination import paginate
from app.services import emotional_release_service
from app.models.emotional_release import EmotionalReleaseCreate

router = APIRouter(prefix="/api/emotional-releases", tags=["emotional-releases"])


@router.get("")
def list_releases(page: int | None = Query(None, ge=1), page_size: int | None = Query(None, ge=1, le=100), customer_ids: str | None = Query(None), nickname: str | None = Query(None), closer_name: str | None = Query(None)):
    items = emotional_release_service.list_releases()
    items_dict = [i.model_dump() if hasattr(i, "model_dump") else i for i in items]
    if customer_ids:
        allowed = set(customer_ids.split(","))
        items_dict = [i for i in items_dict if i.get("customer_id") in allowed]
    if nickname:
        kw = nickname.lower()
        items_dict = [i for i in items_dict if kw in (i.get("nickname") or "").lower()]
    if closer_name:
        kw = closer_name.lower()
        items_dict = [i for i in items_dict if kw in (i.get("closer_name") or "").lower()]
    if page is not None:
        return paginate(items_dict, page, page_size or 10)
    return items_dict


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
