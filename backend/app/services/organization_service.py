import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from app.models.organization import Organization, OrganizationCreate
from app.services.storage import load_data, save_item, delete_item

FILENAME = "organizations.json"
_organizations: Dict[str, Organization] = {}


def _load():
    global _organizations
    data = load_data(FILENAME)
    _organizations = {k: Organization(**v) for k, v in data.items()}


def _save(item_id: str):
    item = _organizations.get(item_id)
    if item:
        save_item(FILENAME, item_id, item.model_dump(mode="json"))


_load()


def list_organizations() -> List[Organization]:
    return [v for v in _organizations.values() if not v.is_deleted]


def get_organization(org_id: str) -> Optional[Organization]:
    org = _organizations.get(org_id)
    if org and org.is_deleted:
        return None
    return org


def create_organization(data: OrganizationCreate) -> Organization:
    now = datetime.now(timezone.utc)
    org = Organization(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **data.model_dump(),
    )
    _organizations[org.id] = org
    _save(org.id)
    return org


def update_organization(org_id: str, data: dict) -> Optional[Organization]:
    org = _organizations.get(org_id)
    if not org:
        return None
    for key, value in data.items():
        if hasattr(org, key):
            setattr(org, key, value)
    org.updated_at = datetime.now(timezone.utc)
    _organizations[org_id] = org
    _save(org_id)
    return org


def delete_organization(org_id: str) -> bool:
    org = _organizations.get(org_id)
    if not org:
        return False
    org.is_deleted = True
    org.deleted_at = datetime.now(timezone.utc)
    _save(org_id)
    return True
