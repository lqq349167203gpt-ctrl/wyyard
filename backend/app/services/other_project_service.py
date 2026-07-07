import uuid
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Optional, Dict

from app.models.other_project import OtherProject, OtherProjectCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "other_projects.json"
_projects: Dict[str, OtherProject] = {}


def _migrate_closers(item: OtherProject) -> OtherProject:
    if not item.closers and item.closer_id:
        item.closers = [{"id": item.closer_id, "name": item.closer_name or "", "amount": 0}]
    return item


def _load():
    global _projects
    data = load_data(FILENAME)
    _projects = {k: _migrate_closers(OtherProject(**v)) for k, v in data.items()}


def _save(project_id: str = ""):
    if project_id:
        item = _projects.get(project_id)
        if item:
            save_item(FILENAME, project_id, item.model_dump(mode="json"))
    else:
        data = {k: v.model_dump(mode="json") for k, v in _projects.items()}
        save_data(FILENAME, data)


_load()


def _calc_expiry(effective_date: str, duration_type: Optional[str], duration_value: Optional[int]) -> Optional[str]:
    if not duration_type or not duration_value:
        return None
    try:
        start = datetime.strptime(effective_date, "%Y-%m-%d")
    except ValueError:
        return None
    if duration_type == "day":
        end = start + timedelta(days=duration_value) - timedelta(days=1)
    elif duration_type == "month":
        end = start + relativedelta(months=duration_value) - timedelta(days=1)
    else:
        return None
    return end.strftime("%Y-%m-%d")


def list_projects() -> List[OtherProject]:
    return [v for v in _projects.values() if not v.is_deleted]


def get_project(project_id: str) -> Optional[OtherProject]:
    p = _projects.get(project_id)
    if p and p.is_deleted:
        return None
    return p


def create_project(data: OtherProjectCreate) -> OtherProject:
    now = datetime.now(timezone.utc)
    project_data = data.model_dump()
    if project_data.get("total_count") is None:
        project_data["total_count"] = project_data.get("remaining_count")
    project_data["expiry_date"] = _calc_expiry(
        project_data["effective_date"],
        project_data.get("duration_type"),
        project_data.get("duration_value"),
    )
    project = OtherProject(
        id=str(uuid.uuid4())[:12],
        created_at=now,
        updated_at=now,
        **project_data,
    )
    _projects[project.id] = project
    _save(project.id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(project.customer_id)
    return project


def update_project(project_id: str, data: dict) -> Optional[OtherProject]:
    project = _projects.get(project_id)
    if not project:
        return None
    for key, value in data.items():
        if hasattr(project, key) and key not in ("id", "created_at", "created_by"):
            setattr(project, key, value)
    # remaining_count 是派生字段，若前端直接修改了 remaining_count，同步到 total_count
    if "remaining_count" in data and "total_count" not in data:
        project.total_count = data["remaining_count"]
    # total_count 设为 null 表示不限，remaining_count 也要清空
    if data.get("total_count") is None:
        project.remaining_count = None
    project.expiry_date = _calc_expiry(
        project.effective_date,
        project.duration_type,
        project.duration_value,
    )
    project.updated_at = datetime.now(timezone.utc)
    _projects[project_id] = project
    _save(project_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(project.customer_id)
    return project


def delete_project(project_id: str) -> bool:
    project = _projects.get(project_id)
    if not project:
        return False
    project.is_deleted = True
    project.deleted_at = datetime.now(timezone.utc)
    _save(project_id)
    from app.services.member_identity_service import refresh_member_type
    refresh_member_type(project.customer_id)
    return True


def get_effective_remaining(project_id: str) -> Optional[int]:
    """该的真实剩余次数：total_count - 销卡流水。None 表示不限次。"""
    project = _projects.get(project_id)
    if not project:
        return 0
    if project.total_count is None:
        return None
    from app.services.project_deduction_service import get_deduction_total_for_project
    deducted = get_deduction_total_for_project(project_id)
    return max(0, project.total_count - deducted)


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
