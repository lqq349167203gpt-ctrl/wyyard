import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.emotional_release import EmotionalRelease, EmotionalReleaseCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "emotional_releases.json"
_releases: Dict[str, EmotionalRelease] = {}


def _migrate_closers(item: EmotionalRelease) -> EmotionalRelease:
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]
    return item


def _load():
    global _releases
    data = load_data(FILENAME)
    _releases = {}
    for k, v in data.items():
        _releases[k] = _migrate_closers(EmotionalRelease(**v))


def _save(release_id: str = ""):
    if release_id:
        item = _releases.get(release_id)
        if item:
            save_item(FILENAME, release_id, item.model_dump(mode="json"))
    else:
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
    _save(release.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(release.customer_id)
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
    _save(release_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(release.customer_id)
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
    _save(release_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(release.customer_id)
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
