import uuid
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Optional, Dict

from app.models.other_project import OtherProject, OtherProjectCreate
from app.services.storage import load_data, save_data, save_item
from app.services import customer_service

FILENAME = "other_projects.json"
_projects: Dict[str, OtherProject] = {}


def _load():
    global _projects
    data = load_data(FILENAME)
    _projects = {k: OtherProject(**v) for k, v in data.items()}


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
        end = start + timedelta(days=duration_value)
    elif duration_type == "month":
        end = start + relativedelta(months=duration_value)
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
    project_data["expiry_date"] = _calc_expiry(
        project_data["effective_date"],
        project_data.get("duration_type"),
        project_data.get("duration_value"),
    )
    project = OtherProject(
        id=str(uuid.uuid4())[:8],
        created_at=now,
        updated_at=now,
        **project_data,
    )
    _projects[project.id] = project
    _save(project.id)
    return project


def update_project(project_id: str, data: dict) -> Optional[OtherProject]:
    project = _projects.get(project_id)
    if not project:
        return None
    for key, value in data.items():
        if hasattr(project, key) and key not in ("id", "created_at"):
            setattr(project, key, value)
    project.expiry_date = _calc_expiry(
        project.effective_date,
        project.duration_type,
        project.duration_value,
    )
    project.updated_at = datetime.now(timezone.utc)
    _projects[project_id] = project
    _save(project_id)
    return project


def delete_project(project_id: str) -> bool:
    project = _projects.get(project_id)
    if not project:
        return False
    project.is_deleted = True
    project.deleted_at = datetime.now(timezone.utc)
    _save(project_id)
    return True


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
