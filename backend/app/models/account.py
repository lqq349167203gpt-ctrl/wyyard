from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AccountBase(BaseModel):
    owner: str  # 归属人
    role: str  # 角色
    username: str  # 账号
    password: str  # 密码
    enabled: bool = True  # 是否启用


class AccountCreate(AccountBase):
    pass


class Account(AccountBase):
    id: str
    created_at: datetime
    is_system: bool = False
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class RoleBase(BaseModel):
    name: str  # 角色名
    permissions: list[str] = []  # 权限列表


class RoleCreate(RoleBase):
    pass


class Role(RoleBase):
    id: str
    created_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
