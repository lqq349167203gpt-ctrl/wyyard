import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.organization import Organization, OrganizationCreate
from app.services.storage import load_data, save_item

FILENAME = "organizations.json"
_organizations: Dict[str, Organization] = {}
PROTECTED_NAMES = {"无忧茶苑", "无忧茶院"}


def _is_protected_name(name: str) -> bool:
    return name.strip() in PROTECTED_NAMES


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
    return sorted(
        [v for v in _organizations.values() if not v.is_deleted],
        key=lambda o: (o.sort_order is None, o.sort_order or 0)
    )


def get_organization(org_id: str) -> Optional[Organization]:
    org = _organizations.get(org_id)
    if org and org.is_deleted:
        return None
    return org


def create_organization(data: OrganizationCreate) -> Organization:
    normalized_name = data.name.strip()
    if not normalized_name:
        raise ValueError("组织名称不能为空")
    # 检查重名
    existing_names = {o.name for o in _organizations.values() if not o.is_deleted}
    has_protected_organization = any(_is_protected_name(name) for name in existing_names)
    if normalized_name in existing_names or (_is_protected_name(normalized_name) and has_protected_organization):
        raise ValueError("组织名称已存在")
    now = datetime.now(timezone.utc)
    org = Organization(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        name=normalized_name,
        member_ids=data.member_ids,
        sort_order=data.sort_order,
    )
    _organizations[org.id] = org
    _save(org.id)
    return org


def update_organization(org_id: str, data: dict) -> Optional[Organization]:
    org = _organizations.get(org_id)
    if not org:
        return None
    if _is_protected_name(org.name) and any(key in data for key in ("name", "is_deleted", "deleted_at")):
        raise ValueError(f"「{org.name}」为系统核心组织，不允许改名或删除")
    # 检查名称
    new_name = data.get("name")
    if new_name is not None:
        if not new_name.strip():
            raise ValueError("组织名称不能为空")
        existing_names = {o.name for o in _organizations.values() if not o.is_deleted and o.id != org_id}
        has_protected_organization = any(_is_protected_name(name) for name in existing_names)
        if new_name.strip() in existing_names or (_is_protected_name(new_name) and has_protected_organization):
            raise ValueError("组织名称已存在")
        data["name"] = new_name.strip()
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
    if _is_protected_name(org.name):
        raise ValueError(f"「{org.name}」为系统核心组织，不允许删除")
    org.is_deleted = True
    org.deleted_at = datetime.now(timezone.utc)
    _save(org_id)
    return True
