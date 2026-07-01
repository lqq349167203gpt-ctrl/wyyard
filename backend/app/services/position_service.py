import uuid
import threading
from datetime import datetime, timezone
from typing import List, Optional, Dict
from app.models.base import StrictBaseModel
from app.services.storage import load_data, save_data, save_item
from app.models.position import PositionUpdate
from app.models.account import AccountUpdate

_position_lock = threading.Lock()

FILENAME = "positions.json"


class PositionBase(StrictBaseModel):
    name: str
    description: str = ""
    icon: str = "Users"


class PositionCreate(PositionBase):
    pass


class Position(PositionBase):
    id: str
    created_at: datetime
    is_system: bool = False
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


_positions: Dict[str, Position] = {}


def _load():
    global _positions
    data = load_data(FILENAME)
    _positions = {k: Position(**v) for k, v in data.items()}


def _save(item_id: str = ""):
    if item_id:
        item = _positions.get(item_id)
        if item:
            save_item(FILENAME, item_id, item.model_dump(mode="json"))
    else:
        save_data(FILENAME, {k: v.model_dump(mode="json") for k, v in _positions.items()})


_load()


def list_positions() -> List[Position]:
    return sorted([v for v in _positions.values() if not v.is_deleted], key=lambda x: x.created_at)


def get_position(position_id: str) -> Optional[Position]:
    p = _positions.get(position_id)
    if p and not p.is_deleted:
        return p
    return None


def create_position(data: PositionCreate) -> Position:
    with _position_lock:
        # 名称唯一性校验
        for other in _positions.values():
            if not other.is_deleted and other.name == data.name:
                raise ValueError(f"身份名称「{data.name}」已存在")
        now = datetime.now(timezone.utc)
        position = Position(id=str(uuid.uuid4())[:12], created_at=now, **data.model_dump())
        _positions[position.id] = position
        _save(position.id)
        return position


def update_position(position_id: str, data: PositionUpdate) -> Optional[Position]:
    with _position_lock:
        position = _positions.get(position_id)
        if not position:
            return None
        if position.is_system:
            raise ValueError("系统身份不可修改")
        update_data = data.model_dump(exclude_unset=True)
        # 名称校验
        if "name" in update_data:
            new_name = update_data["name"]
            if not new_name or not new_name.strip():
                raise ValueError("身份名称不能为空")
            for other in _positions.values():
                if other.id != position_id and not other.is_deleted and other.name == new_name:
                    raise ValueError(f"身份名称「{new_name}」已存在")
        old_name = position.name if "name" in update_data else None
        for k, v in update_data.items():
            if hasattr(position, k):
                setattr(position, k, v)
        _save(position_id)
    # 锁外级联：更新权限表 + 账号 role（通过公共 API，不直接操作其他 service 内部状态）
    if old_name and old_name != position.name:
        from app.services.position_permission_service import rename_position_in_permissions as rename_pp
        from app.services.position_customer_permission_service import rename_position_in_permissions as rename_pcp
        from app.services.position_page_permission_service import rename_position_in_page_permissions as rename_ppp
        from app.services import account_service
        rename_pp(old_name, position.name)
        rename_pcp(old_name, position.name)
        rename_ppp(old_name, position.name)
        for acc in account_service.list_accounts():
            if acc.role == old_name:
                account_service.update_account(acc.id, AccountUpdate(role=position.name))
    return position


def delete_position(position_id: str) -> bool:
    # 先获取 position 信息（用于后续检查）
    position = _positions.get(position_id)
    if not position:
        return False
    if position.is_system:
        return False
    # 检查是否有账号引用此角色（通过公共 API，不持有 position_lock）
    from app.services import account_service
    refs = [a for a in account_service.list_accounts() if a.role == position.name]
    if refs:
        names = ", ".join(a.owner or a.username for a in refs[:5])
        raise ValueError(f"角色「{position.name}」被 {len(refs)} 个账号使用（{names}等），请先修改这些账号的角色")
    with _position_lock:
        position.is_deleted = True
        position.deleted_at = datetime.now(timezone.utc)
        _save(position_id)
    return True
