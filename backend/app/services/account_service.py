import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import bcrypt

from app.models.account import Account, AccountCreate, AccountUpdate, Role, RoleCreate, RoleUpdate
from app.services.storage import load_data, save_data, save_item
from app.utils.request_roles import normalize_roles

ACCOUNTS_FILE = "accounts.json"
ROLES_FILE = "roles.json"
_accounts: Dict[str, Account] = {}
_roles: Dict[str, Role] = {}
_account_lock = threading.Lock()
_role_lock = threading.Lock()


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _load_accounts():
    global _accounts
    data = load_data(ACCOUNTS_FILE)
    loaded = {}
    for key, value in data.items():
        item = dict(value)
        roles = normalize_roles(item.get("roles"), item.get("role", ""))
        item["roles"] = roles
        item["role"] = roles[0] if roles else str(item.get("role", ""))
        loaded[key] = Account(**item)
    _accounts = loaded


def _save_accounts(account_id: str = ""):
    if account_id:
        item = _accounts.get(account_id)
        if item:
            save_item(ACCOUNTS_FILE, account_id, item.model_dump(mode="json"))
    else:
        save_data(ACCOUNTS_FILE, {k: v.model_dump(mode="json") for k, v in _accounts.items()})


def _load_roles():
    global _roles
    data = load_data(ROLES_FILE)
    _roles = {k: Role(**v) for k, v in data.items()}


def _save_roles(role_id: str = ""):
    if role_id:
        item = _roles.get(role_id)
        if item:
            save_item(ROLES_FILE, role_id, item.model_dump(mode="json"))
    else:
        save_data(ROLES_FILE, {k: v.model_dump(mode="json") for k, v in _roles.items()})


_load_accounts()
_load_roles()


def _migrate_plaintext_passwords():
    """将明文密码迁移为 bcrypt 哈希"""
    changed = False
    for account in _accounts.values():
        if not account.password.startswith("$2b$"):
            account.password = _hash_password(account.password)
            changed = True
    if changed:
        _save_accounts()


_migrate_plaintext_passwords()


# ===== 账号 =====

def list_accounts() -> List[Account]:
    return sorted([v for v in _accounts.values() if not v.is_deleted], key=lambda x: x.created_at, reverse=True)


def get_account(account_id: str) -> Optional[Account]:
    account = _accounts.get(account_id)
    if account and account.is_deleted:
        return None
    return account


def create_account(data: AccountCreate) -> Account:
    with _account_lock:
        # 验证归属人唯一性（跳过已删除的账号）
        for account in _accounts.values():
            if account.is_deleted:
                continue
            if account.owner == data.owner:
                raise ValueError("归属人已存在")
            if account.username == data.username:
                raise ValueError("账号已存在")

        now = datetime.now(timezone.utc)
        account_data = data.model_dump()
        roles = normalize_roles(account_data.get("roles"), account_data.get("role", ""))
        if not roles:
            raise ValueError("至少选择一个角色")
        account_data["roles"] = roles
        account_data["role"] = roles[0]
        account_data["password"] = _hash_password(account_data["password"])
        account = Account(id=str(uuid.uuid4())[:12], created_at=now, **account_data)
        _accounts[account.id] = account
        _save_accounts(account.id)
        return account


def update_account(account_id: str, data: AccountUpdate) -> Optional[Account]:
    with _account_lock:
        account = _accounts.get(account_id)
        if not account or account.is_deleted:
            return None
        update_data = data.model_dump(exclude_unset=True)
        if "roles" in update_data:
            roles = normalize_roles(update_data.get("roles"))
            if not roles:
                raise ValueError("至少选择一个角色")
            update_data["roles"] = roles
            update_data["role"] = roles[0]
        elif "role" in update_data:
            roles = normalize_roles(update_data.get("role"))
            update_data["roles"] = roles
            update_data["role"] = roles[0]
        # 唯一性校验（排除自身和已删除）
        if "owner" in update_data:
            for other in _accounts.values():
                if other.id != account_id and not other.is_deleted and other.owner == update_data["owner"]:
                    raise ValueError("归属人已存在")
        if "username" in update_data:
            for other in _accounts.values():
                if other.id != account_id and not other.is_deleted and other.username == update_data["username"]:
                    raise ValueError("账号已存在")
        # 密码字段需要 hash
        if "password" in update_data:
            update_data["password"] = _hash_password(update_data["password"])
        for k, v in update_data.items():
            if hasattr(account, k):
                setattr(account, k, v)
        _save_accounts(account_id)
        return account


def delete_account(account_id: str) -> bool:
    with _account_lock:
        account = _accounts.get(account_id)
        if not account:
            return False
        # 系统账号不可删除
        if account.is_system:
            return False
        account.is_deleted = True
        account.deleted_at = datetime.now(timezone.utc)
        _save_accounts(account_id)
        return True


def login(username: str, password: str) -> Optional[Account]:
    for account in _accounts.values():
        if account.is_deleted:
            continue
        if account.username == username and _check_password(password, account.password) and account.enabled:
            return account
    return None


def get_by_owner(owner: str) -> Optional[Account]:
    """按归属人查找账号"""
    for account in _accounts.values():
        if account.owner == owner and not account.is_deleted and account.enabled:
            return account
    return None


def get_by_username(username: str) -> Optional[Account]:
    """按用户名查找账号"""
    for account in _accounts.values():
        if account.username == username and not account.is_deleted:
            return account
    return None


def account_has_role(account: Account | None, role: str) -> bool:
    if not account:
        return False
    return role in normalize_roles(account.roles, account.role)


def change_password(account_id: str, old_password: str, new_password: str) -> bool:
    with _account_lock:
        account = _accounts.get(account_id)
        if not account or account.is_deleted:
            return False
        if not _check_password(old_password, account.password):
            raise ValueError("原密码错误")
        if old_password == new_password:
            raise ValueError("新密码不能与原密码相同")
        account.password = _hash_password(new_password)
        account.password_changed_at = datetime.now(timezone.utc)
        _save_accounts(account_id)
    # 清除该账号所有 session（密码修改后其他设备需重新登录）
    from app.services import session_service
    session_service.delete_account_sessions(account_id)
    return True


def admin_reset_password(account_id: str, new_password: str) -> bool:
    """管理员重置密码（不需要旧密码）"""
    with _account_lock:
        account = _accounts.get(account_id)
        if not account or account.is_deleted:
            return False
        account.password = _hash_password(new_password)
        account.password_changed_at = datetime.now(timezone.utc)
        _save_accounts(account_id)
    # 清除该账号所有 session（密码重置后其他设备需重新登录）
    from app.services import session_service
    session_service.delete_account_sessions(account_id)
    return True


# ===== 角色 =====

def list_roles() -> List[Role]:
    return sorted([v for v in _roles.values() if not v.is_deleted], key=lambda x: x.created_at, reverse=True)


def create_role(data: RoleCreate) -> Role:
    with _role_lock:
        now = datetime.now(timezone.utc)
        role = Role(id=str(uuid.uuid4())[:12], created_at=now, **data.model_dump())
        _roles[role.id] = role
        _save_roles(role.id)
        return role


def update_role(role_id: str, data: RoleUpdate) -> Optional[Role]:
    with _role_lock:
        role = _roles.get(role_id)
        if not role:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for k, v in update_data.items():
            if hasattr(role, k):
                setattr(role, k, v)
        _save_roles(role_id)
        return role


def delete_role(role_id: str) -> bool:
    with _role_lock:
        role = _roles.get(role_id)
        if not role:
            return False
        role.is_deleted = True
        role.deleted_at = datetime.now(timezone.utc)
        _save_roles(role_id)
        return True
