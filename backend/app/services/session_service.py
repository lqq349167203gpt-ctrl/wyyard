"""登录 session 跟踪服务"""
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.storage import delete_item, load_data, save_data, save_item

SESSIONS_FILE = "sessions.json"
_sessions: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def _load():
    global _sessions
    _sessions = load_data(SESSIONS_FILE) or {}


def _save(session_id: str = ""):
    if session_id:
        item = _sessions.get(session_id)
        if item:
            save_item(SESSIONS_FILE, session_id, item)
    else:
        save_data(SESSIONS_FILE, _sessions)


_load()


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
    with _lock:
        _sessions[session_id] = session
        _save(session_id)
    return session


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    return _sessions.get(session_id)


def list_account_sessions(account_id: str) -> List[Dict[str, Any]]:
    return [s for s in _sessions.values() if s.get("account_id") == account_id]


def delete_session(session_id: str) -> bool:
    with _lock:
        if session_id in _sessions:
            del _sessions[session_id]
            delete_item(SESSIONS_FILE, session_id)
            return True
    return False


def delete_account_sessions(account_id: str):
    to_delete = [sid for sid, s in _sessions.items() if s.get("account_id") == account_id]
    with _lock:
        for sid in to_delete:
            if sid in _sessions:
                del _sessions[sid]
                delete_item(SESSIONS_FILE, sid)


def has_account_sessions(account_id: str) -> bool:
    """检查某账号是否有活跃 session（用于中间件判断是否需要校验 session）"""
    return any(s.get("account_id") == account_id for s in _sessions.values())
