import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.emotional_release import EmotionalRelease, EmotionalReleaseCreate
from app.services.storage import load_data, save_data
from app.services import customer_service

FILENAME = "emotional_releases.json"
_releases: Dict[str, EmotionalRelease] = {}


def _load():
    global _releases
    data = load_data(FILENAME)
    _releases = {}
    for k, v in data.items():
        _releases[k] = EmotionalRelease(**v)


def _save():
    data = {k: v.model_dump(mode="json") for k, v in _releases.items()}
    save_data(FILENAME, data)


_load()


def list_releases() -> List[EmotionalRelease]:
    return [v for v in _releases.values() if not v.is_deleted]


def get_release(release_id: str) -> Optional[EmotionalRelease]:
    release = _releases.get(release_id)
    if release and release.is_deleted:
        return None
    return release


def create_release(data: EmotionalReleaseCreate) -> EmotionalRelease:
    now = datetime.now(timezone.utc)
    release = EmotionalRelease(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _releases[release.id] = release
    _save()
    return release


def update_release(release_id: str, data: dict) -> Optional[EmotionalRelease]:
    release = _releases.get(release_id)
    if not release:
        return None
    for key, value in data.items():
        if hasattr(release, key) and key not in ("id", "created_at"):
            setattr(release, key, value)
    release.updated_at = datetime.now(timezone.utc)
    _releases[release_id] = release
    _save()
    return release


def delete_release(release_id: str) -> tuple[bool, str]:
    release = _releases.get(release_id)
    if not release:
        return False, "记录不存在"
    from app.services import emotional_release_session_service
    remaining = emotional_release_session_service.get_remaining_count(release.customer_id)
    if remaining - release.purchase_count < 0:
        return False, "该记录中有正在被使用的次数，无法删除"
    release.is_deleted = True
    release.deleted_at = datetime.now(timezone.utc)
    _save()
    return True, "删除成功"


def search_customers(keyword: str) -> list:
    if not keyword:
        return []
    customers = customer_service.list_customers()
    results = []
    for c in customers:
        if keyword in c.nickname or (c.name and keyword in c.name):
            results.append({
                "id": c.id,
                "nickname": c.nickname,
                "name": c.name,
                "member_type": c.member_type,
            })
    return results
