"""登录 session 跟踪服务

读取每次直查 PostgreSQL，不使用进程内存缓存：
多实例/多进程部署时，import 时加载的内存快照会导致互相误踢。
写入保持同步落库（save_item / delete_item）。
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.storage import delete_item, load_data, load_item, save_item

SESSIONS_FILE = "sessions.json"


def create_session(session_id: str, account_id: str, device_info: str = "", ip: str = "") -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    session = {
        "id": session_id,
        "account_id": account_id,
        "device_info": device_info,
        "ip": ip,
        "login_time": now,
        "last_active": now,
    }
    save_item(SESSIONS_FILE, session_id, session)
    return session


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    # 每次直查数据库，保证踢出/改密立即生效
    return load_item(SESSIONS_FILE, session_id)


def list_account_sessions(account_id: str) -> List[Dict[str, Any]]:
    sessions = load_data(SESSIONS_FILE) or {}
    return [s for s in sessions.values() if s.get("account_id") == account_id]


def delete_session(session_id: str) -> bool:
    if load_item(SESSIONS_FILE, session_id) is None:
        return False
    delete_item(SESSIONS_FILE, session_id)
    return True


def delete_account_sessions(account_id: str):
    sessions = load_data(SESSIONS_FILE) or {}
    for sid, s in sessions.items():
        if s.get("account_id") == account_id:
            delete_item(SESSIONS_FILE, sid)


def has_account_sessions(account_id: str) -> bool:
    """检查某账号是否有活跃 session（用于中间件判断是否需要校验 session）"""
    sessions = load_data(SESSIONS_FILE) or {}
    return any(s.get("account_id") == account_id for s in sessions.values())
