"""登录 session 跟踪服务

读取每次直查 PostgreSQL，不使用进程内存缓存：
多实例/多进程部署时，import 时加载的内存快照会导致互相误踢。
写入保持同步落库（save_item / delete_item）。
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.config.settings import settings
from app.services.storage import delete_item, load_data, load_item, save_item

SESSIONS_FILE = "sessions.json"
SESSION_TOUCH_INTERVAL_SECONDS = 300


def _parse_time(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _session_time(session: Dict[str, Any]) -> datetime:
    return _parse_time(session.get("last_active")) or _parse_time(session.get("login_time")) or datetime.min.replace(tzinfo=timezone.utc)


def _is_expired(session: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    last_active = _session_time(session)
    return (now or datetime.now(timezone.utc)) - last_active > timedelta(hours=settings.jwt_expire_hours)


def _legacy_device_key(session: Dict[str, Any]) -> str:
    device_info = str(session.get("device_info") or "").strip()
    ip = str(session.get("ip") or "").strip()
    if device_info or ip:
        return f"legacy:{device_info}:{ip}"
    return f"session:{session.get('id', '')}"


def _device_key(session: Dict[str, Any]) -> str:
    device_id = str(session.get("device_id") or "").strip()
    return f"device:{device_id}" if device_id else _legacy_device_key(session)


def create_session(
    session_id: str,
    account_id: str,
    device_info: str = "",
    ip: str = "",
    device_id: str = "",
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    normalized_device_id = device_id.strip()[:120]
    sessions = load_data(SESSIONS_FILE) or {}
    for existing_id, existing in list(sessions.items()):
        if existing.get("account_id") != account_id or existing_id == session_id:
            continue
        same_device_id = bool(normalized_device_id and existing.get("device_id") == normalized_device_id)
        same_legacy_device = bool(
            normalized_device_id
            and not existing.get("device_id")
            and existing.get("device_info", "") == device_info
            and existing.get("ip", "") == ip
        )
        if same_device_id or same_legacy_device:
            delete_item(SESSIONS_FILE, existing_id)
    session = {
        "id": session_id,
        "account_id": account_id,
        "device_info": device_info,
        "device_id": normalized_device_id,
        "ip": ip,
        "login_time": now,
        "last_active": now,
    }
    save_item(SESSIONS_FILE, session_id, session)
    return session


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    # 每次直查数据库，保证踢出/改密立即生效
    return load_item(SESSIONS_FILE, session_id)


def touch_session(session_id: str) -> bool:
    """刷新会话活跃时间；五分钟内最多写库一次，避免每个接口请求都更新数据库。"""
    session = load_item(SESSIONS_FILE, session_id)
    if not session:
        return False
    now = datetime.now(timezone.utc)
    if (now - _session_time(session)).total_seconds() < SESSION_TOUCH_INTERVAL_SECONDS:
        return True
    session["last_active"] = now.isoformat()
    save_item(SESSIONS_FILE, session_id, session)
    return True


def list_account_sessions(account_id: str, current_session_id: str = "") -> List[Dict[str, Any]]:
    sessions = load_data(SESSIONS_FILE) or {}
    now = datetime.now(timezone.utc)
    active_sessions: list[Dict[str, Any]] = []
    for session_id, session in list(sessions.items()):
        if session.get("account_id") != account_id:
            continue
        if session_id != current_session_id and _is_expired(session, now):
            delete_item(SESSIONS_FILE, session_id)
            continue
        active_sessions.append(session)

    # 兼容历史数据：旧会话没有 device_id，按“设备信息 + IP”合并，只保留最近活跃的一条。
    latest_by_device: dict[str, Dict[str, Any]] = {}
    ordered_sessions = sorted(
        active_sessions,
        key=lambda session: (session.get("id") == current_session_id, _session_time(session)),
        reverse=True,
    )
    for session in ordered_sessions:
        key = _device_key(session)
        if key in latest_by_device:
            delete_item(SESSIONS_FILE, session["id"])
            continue
        latest_by_device[key] = session
    return sorted(latest_by_device.values(), key=_session_time, reverse=True)


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
    now = datetime.now(timezone.utc)
    return any(
        session.get("account_id") == account_id and not _is_expired(session, now)
        for session in sessions.values()
    )
