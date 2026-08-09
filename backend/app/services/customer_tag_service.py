import threading
import uuid
from datetime import datetime, timezone

from app.models.customer_tag import CustomerTag, CustomerTagAssignment, CustomerTagCreate, CustomerTagUpdate
from app.services.storage import delete_item, load_data, save_item

TAG_FILE = "customer_tags.json"
ASSIGNMENT_FILE = "customer_tag_assignments.json"

_lock = threading.RLock()
_tags: dict[str, CustomerTag] = {}
_assignments: dict[str, CustomerTagAssignment] = {}


def _load() -> None:
    global _tags, _assignments
    _tags = {key: CustomerTag(**value) for key, value in load_data(TAG_FILE).items()}
    _assignments = {
        key: CustomerTagAssignment(**value)
        for key, value in load_data(ASSIGNMENT_FILE).items()
    }


_load()


def _is_visible(tag: CustomerTag, actor_id: str) -> bool:
    return tag.scope == "public" or tag.created_by_id == actor_id


def _active_tags() -> list[CustomerTag]:
    return [tag for tag in _tags.values() if not tag.is_deleted and tag.enabled]


def _usage_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for assignment in _assignments.values():
        counts[assignment.tag_id] = counts.get(assignment.tag_id, 0) + 1
    return counts


def _as_response(tag: CustomerTag, usage_counts: dict[str, int] | None = None) -> dict:
    data = tag.model_dump(mode="json")
    data["usage_count"] = (usage_counts or {}).get(tag.id, 0)
    return data


def list_visible_tags(actor_id: str, include_disabled: bool = False) -> list[dict]:
    counts = _usage_counts()
    tags = [
        tag for tag in _tags.values()
        if not tag.is_deleted
        and _is_visible(tag, actor_id)
        and (include_disabled or tag.enabled)
    ]
    tags.sort(key=lambda tag: (0 if tag.scope == "public" else 1, tag.created_at, tag.name))
    return [_as_response(tag, counts) for tag in tags]


def get_tag(tag_id: str) -> CustomerTag | None:
    tag = _tags.get(tag_id)
    return tag if tag and not tag.is_deleted else None


def create_tag(data: CustomerTagCreate, actor_id: str, actor_name: str) -> dict:
    name = data.name.strip()
    if not name:
        raise ValueError("标签名称不能为空")
    with _lock:
        for tag in _tags.values():
            if tag.is_deleted or tag.name.casefold() != name.casefold() or tag.scope != data.scope:
                continue
            if data.scope == "public" or tag.created_by_id == actor_id:
                raise ValueError("标签名称已存在")
        now = datetime.now(timezone.utc)
        tag = CustomerTag(
            id=str(uuid.uuid4())[:12],
            name=name,
            scope=data.scope,
            description=data.description.strip(),
            created_by_id=actor_id,
            created_by_name=actor_name,
            created_at=now,
            updated_at=now,
        )
        _tags[tag.id] = tag
        save_item(TAG_FILE, tag.id, tag.model_dump(mode="json"))
    return _as_response(tag)


def update_tag(tag_id: str, data: CustomerTagUpdate, actor_id: str, can_manage_public: bool) -> dict | None:
    with _lock:
        tag = get_tag(tag_id)
        if not tag:
            return None
        if tag.scope == "public" and not can_manage_public:
            raise PermissionError("无权修改公共标签")
        if tag.scope == "private" and tag.created_by_id != actor_id:
            raise PermissionError("无权修改他人的私有标签")

        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data:
            name = update_data["name"].strip()
            if not name:
                raise ValueError("标签名称不能为空")
            for other in _tags.values():
                if other.id == tag_id or other.is_deleted or other.scope != tag.scope:
                    continue
                same_owner = tag.scope == "public" or other.created_by_id == actor_id
                if same_owner and other.name.casefold() == name.casefold():
                    raise ValueError("标签名称已存在")
            update_data["name"] = name
        if "description" in update_data:
            update_data["description"] = update_data["description"].strip()
        for key, value in update_data.items():
            setattr(tag, key, value)
        tag.updated_at = datetime.now(timezone.utc)
        save_item(TAG_FILE, tag.id, tag.model_dump(mode="json"))
    return _as_response(tag, _usage_counts())


def archive_tag(tag_id: str, actor_id: str, can_manage_public: bool) -> bool:
    with _lock:
        tag = get_tag(tag_id)
        if not tag:
            return False
        if tag.scope == "public" and not can_manage_public:
            raise PermissionError("无权停用公共标签")
        if tag.scope == "private" and tag.created_by_id != actor_id:
            raise PermissionError("无权停用他人的私有标签")
        tag.is_deleted = True
        tag.deleted_at = datetime.now(timezone.utc)
        tag.updated_at = tag.deleted_at
        save_item(TAG_FILE, tag.id, tag.model_dump(mode="json"))
    return True


def list_customer_tags(customer_id: str, actor_id: str) -> list[dict]:
    visible = {tag.id: tag for tag in _active_tags() if _is_visible(tag, actor_id)}
    tags = [
        visible[assignment.tag_id]
        for assignment in _assignments.values()
        if assignment.customer_id == customer_id and assignment.tag_id in visible
    ]
    tags.sort(key=lambda tag: (0 if tag.scope == "public" else 1, tag.name))
    return [_as_response(tag) for tag in tags]


def visible_tags_by_customer(actor_id: str) -> dict[str, list[dict]]:
    visible = {tag.id: tag for tag in _active_tags() if _is_visible(tag, actor_id)}
    result: dict[str, list[CustomerTag]] = {}
    for assignment in _assignments.values():
        tag = visible.get(assignment.tag_id)
        if tag:
            result.setdefault(assignment.customer_id, []).append(tag)
    return {
        customer_id: [
            _as_response(tag)
            for tag in sorted(tags, key=lambda item: (0 if item.scope == "public" else 1, item.name))
        ]
        for customer_id, tags in result.items()
    }


def set_customer_tags(customer_id: str, tag_ids: list[str], actor_id: str, actor_name: str) -> list[dict]:
    desired_ids = list(dict.fromkeys(tag_ids))
    visible = {tag.id: tag for tag in _active_tags() if _is_visible(tag, actor_id)}
    unknown = [tag_id for tag_id in desired_ids if tag_id not in visible]
    if unknown:
        raise PermissionError("包含无权使用或已停用的标签")

    with _lock:
        editable_assignments = {
            assignment.tag_id: assignment
            for assignment in _assignments.values()
            if assignment.customer_id == customer_id
            and assignment.tag_id in visible
        }
        desired = set(desired_ids)
        for tag_id, assignment in editable_assignments.items():
            if tag_id not in desired:
                _assignments.pop(assignment.id, None)
                delete_item(ASSIGNMENT_FILE, assignment.id)
        for tag_id in desired_ids:
            if tag_id in editable_assignments:
                continue
            assignment = CustomerTagAssignment(
                id=str(uuid.uuid4())[:12],
                customer_id=customer_id,
                tag_id=tag_id,
                created_by_id=actor_id,
                created_by_name=actor_name,
                created_at=datetime.now(timezone.utc),
            )
            _assignments[assignment.id] = assignment
            save_item(ASSIGNMENT_FILE, assignment.id, assignment.model_dump(mode="json"))
    return list_customer_tags(customer_id, actor_id)


def customer_ids_for_tags(actor_id: str, tag_ids: list[str], match: str = "any") -> set[str]:
    requested = set(tag_ids)
    if not requested:
        return set()
    visible_ids = {tag.id for tag in _active_tags() if _is_visible(tag, actor_id)}
    if not requested.issubset(visible_ids):
        raise PermissionError("包含无权查看或已停用的标签")

    customer_tags: dict[str, set[str]] = {}
    for assignment in _assignments.values():
        if assignment.tag_id in requested:
            customer_tags.setdefault(assignment.customer_id, set()).add(assignment.tag_id)
    if match == "all":
        return {customer_id for customer_id, ids in customer_tags.items() if requested.issubset(ids)}
    return set(customer_tags)
