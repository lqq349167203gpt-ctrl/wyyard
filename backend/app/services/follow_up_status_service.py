import threading
import uuid
from datetime import datetime, timezone

from app.models.follow_up_status import FollowUpStatusConfig, FollowUpStatusCreate, FollowUpStatusUpdate
from app.services import customer_service
from app.services.storage import load_data, save_item

FILENAME = "follow_up_statuses.json"
UNCONFIGURED = "未配置"
DEFAULT_STATUSES = [
    ("新添加", "刚录入系统、尚未开始沟通的客户"),
    ("前期沟通中", "正在了解需求并进行前期沟通的客户"),
    ("已邀约未到店", "已完成邀约但尚未实际到店的客户"),
    ("已到店", "已经到店但尚未成交的客户"),
    ("已成交", "已经完成付费成交的客户"),
    ("沉默/流失", "暂时无法联系或已明确流失的客户"),
]

_lock = threading.RLock()
_statuses: dict[str, FollowUpStatusConfig] = {}


def _load() -> None:
    global _statuses
    stored = load_data(FILENAME)
    if stored:
        _statuses = {key: FollowUpStatusConfig(**value) for key, value in stored.items()}
        return
    now = datetime.now(timezone.utc)
    _statuses = {}
    for index, (name, description) in enumerate(DEFAULT_STATUSES):
        item = FollowUpStatusConfig(
            id=str(uuid.uuid4())[:12],
            name=name,
            description=description,
            sort_order=index,
            created_at=now,
            updated_at=now,
        )
        _statuses[item.id] = item
        save_item(FILENAME, item.id, item.model_dump(mode="json"))


_load()


def list_statuses(include_disabled: bool = False) -> list[dict]:
    items = [
        item for item in _statuses.values()
        if item.name != UNCONFIGURED and (include_disabled or item.enabled)
    ]
    items.sort(key=lambda item: (item.sort_order, item.created_at, item.name))
    usage_counts: dict[str, int] = {}
    for customer in customer_service.list_customers():
        name = getattr(customer, "follow_up_status", "") or UNCONFIGURED
        usage_counts[name] = usage_counts.get(name, 0) + 1
    return [
        {**item.model_dump(mode="json"), "usage_count": usage_counts.get(item.name, 0)}
        for item in items
    ]


def active_names() -> list[str]:
    return [item["name"] for item in list_statuses()]


def reporting_names() -> list[str]:
    """统计维度包含系统兜底值，但“未配置”不属于可配置状态。"""
    return [*active_names(), UNCONFIGURED]


def is_active(name: str) -> bool:
    return name in active_names()


def create_status(data: FollowUpStatusCreate) -> dict:
    name = data.name.strip()
    description = data.description.strip()
    if not name:
        raise ValueError("状态名称不能为空")
    if not description:
        raise ValueError("状态描述不能为空")
    if name in {"沟通中", UNCONFIGURED}:
        raise ValueError(f"“{name}”是系统保留名称，请使用其他状态名称")
    with _lock:
        if any(item.name.casefold() == name.casefold() for item in _statuses.values()):
            raise ValueError("跟进状态名称已存在")
        now = datetime.now(timezone.utc)
        item = FollowUpStatusConfig(
            id=str(uuid.uuid4())[:12],
            name=name,
            description=description,
            sort_order=max((status.sort_order for status in _statuses.values()), default=-1) + 1,
            created_at=now,
            updated_at=now,
        )
        _statuses[item.id] = item
        save_item(FILENAME, item.id, item.model_dump(mode="json"))
    return {**item.model_dump(mode="json"), "usage_count": 0}


def update_status(status_id: str, data: FollowUpStatusUpdate) -> dict | None:
    with _lock:
        item = _statuses.get(status_id)
        if not item:
            return None
        updates = data.model_dump(exclude_unset=True)
        old_name = item.name
        if old_name == UNCONFIGURED:
            raise ValueError("“未配置”是系统自动归类，不能编辑")
        if "name" in updates:
            name = updates["name"].strip()
            if not name:
                raise ValueError("状态名称不能为空")
            if name in {"沟通中", UNCONFIGURED}:
                raise ValueError(f"“{name}”是系统保留名称，请使用其他状态名称")
            if any(other.id != status_id and other.name.casefold() == name.casefold() for other in _statuses.values()):
                raise ValueError("跟进状态名称已存在")
            updates["name"] = name
        if "description" in updates:
            description = updates["description"].strip()
            if not description:
                raise ValueError("状态描述不能为空")
            updates["description"] = description
        if updates.get("enabled") is False:
            usage_count = sum(1 for customer in customer_service.list_customers() if customer.follow_up_status == old_name)
            if usage_count:
                raise ValueError(f"仍有 {usage_count} 位客户使用该状态，请先调整客户状态")
        for key, value in updates.items():
            setattr(item, key, value)
        item.updated_at = datetime.now(timezone.utc)
        save_item(FILENAME, item.id, item.model_dump(mode="json"))
        if old_name != item.name:
            for customer in customer_service.list_all_customers():
                if customer.follow_up_status == old_name:
                    customer.follow_up_status = item.name
                    customer.updated_at = item.updated_at
                    customer_service._save(customer.id)
    return next(status for status in list_statuses(include_disabled=True) if status["id"] == status_id)
