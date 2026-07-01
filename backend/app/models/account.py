from app.models.base import SafeBaseModel, StrictBaseModel
from datetime import datetime
from typing import Optional


class AccountBase(SafeBaseModel):
    owner: str  # 归属人
    role: str  # 角色
    username: str  # 账号
    password: str  # 密码
    enabled: bool = True  # 是否启用


class AccountCreate(AccountBase):
    pass


class AccountUpdate(StrictBaseModel):
    owner: Optional[str] = None
    role: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    enabled: Optional[bool] = None


class Account(AccountBase):
    id: str
    created_at: datetime
    is_system: bool = False
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    password_changed_at: Optional[datetime] = None


class RoleBase(SafeBaseModel):
    name: str  # 角色名
    permissions: list[str] = []  # 权限列表


class RoleCreate(RoleBase):
    pass


class RoleUpdate(StrictBaseModel):
    name: Optional[str] = None


class Role(RoleBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
