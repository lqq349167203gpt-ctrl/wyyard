import threading
import uuid
from datetime import datetime, timezone

from app.models.custom_analysis import (
    AnalysisTemplate,
    AnalysisTemplateCreate,
    AnalysisTemplateUpdate,
)
from app.services.storage import delete_item, load_data, save_item

FILENAME = "custom_analysis_templates.json"

_lock = threading.RLock()
_templates: dict[str, AnalysisTemplate] = {}


def _load() -> None:
    global _templates
    _templates = {
        template_id: AnalysisTemplate(**value)
        for template_id, value in load_data(FILENAME).items()
    }


_load()


def _visible(template: AnalysisTemplate, actor_id: str, is_super_admin: bool = False) -> bool:
    return is_super_admin or template.created_by_id == actor_id or template.scope == "shared"


def list_templates(actor_id: str, is_super_admin: bool = False) -> list[AnalysisTemplate]:
    templates = [template for template in _templates.values() if _visible(template, actor_id, is_super_admin)]
    templates.sort(
        key=lambda item: (
            0 if item.created_by_id == actor_id else 1,
            -item.use_count,
            -item.updated_at.timestamp(),
            item.name,
        )
    )
    return templates


def get_template(template_id: str, actor_id: str, is_super_admin: bool = False) -> AnalysisTemplate | None:
    template = _templates.get(template_id)
    return template if template and _visible(template, actor_id, is_super_admin) else None


def _ensure_unique_name(name: str, actor_id: str, exclude_id: str = "") -> None:
    normalized = name.casefold()
    if any(
        item.id != exclude_id
        and item.created_by_id == actor_id
        and item.name.casefold() == normalized
        for item in _templates.values()
    ):
        raise ValueError("模板名称已存在")


def create_template(
    data: AnalysisTemplateCreate,
    actor_id: str,
    actor_name: str,
) -> AnalysisTemplate:
    with _lock:
        _ensure_unique_name(data.name, actor_id)
        now = datetime.now(timezone.utc)
        template = AnalysisTemplate(
            id=str(uuid.uuid4())[:12],
            name=data.name,
            description=data.description,
            scope=data.scope,
            plan=data.plan,
            created_by_id=actor_id,
            created_by_name=actor_name,
            created_at=now,
            updated_at=now,
        )
        _templates[template.id] = template
        save_item(FILENAME, template.id, template.model_dump(mode="json"))
        return template


def update_template(
    template_id: str,
    data: AnalysisTemplateUpdate,
    actor_id: str,
    is_super_admin: bool,
) -> AnalysisTemplate | None:
    with _lock:
        template = _templates.get(template_id)
        if not template:
            return None
        if template.created_by_id != actor_id and not is_super_admin:
            raise PermissionError("只能修改自己创建的模板")
        updates = data.model_dump(exclude_unset=True)
        if updates.get("name"):
            _ensure_unique_name(updates["name"], template.created_by_id, template.id)
        for key, value in updates.items():
            if key == "description" and value is None:
                value = ""
            setattr(template, key, value)
        template.updated_at = datetime.now(timezone.utc)
        save_item(FILENAME, template.id, template.model_dump(mode="json"))
        return template


def delete_template(template_id: str, actor_id: str, is_super_admin: bool) -> bool:
    with _lock:
        template = _templates.get(template_id)
        if not template:
            return False
        if template.created_by_id != actor_id and not is_super_admin:
            raise PermissionError("只能删除自己创建的模板")
        del _templates[template_id]
        delete_item(FILENAME, template_id)
        return True


def mark_used(template_id: str, actor_id: str, is_super_admin: bool = False) -> AnalysisTemplate | None:
    with _lock:
        template = get_template(template_id, actor_id, is_super_admin)
        if not template:
            return None
        template.use_count += 1
        template.last_used_at = datetime.now(timezone.utc)
        save_item(FILENAME, template.id, template.model_dump(mode="json"))
        return template
