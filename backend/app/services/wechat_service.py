import uuid
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict
from urllib.request import urlopen, Request
from urllib.parse import urlencode

from app.models.wechat_session import WechatSession
from app.services.storage import load_data, save_item, save_data
from app.config.settings import settings

logger = logging.getLogger(__name__)

SESSIONS_FILE = "wechat_sessions.json"
_sessions: Dict[str, WechatSession] = {}

EXPIRE_DAYS = 30


def _load_sessions():
    global _sessions
    data = load_data(SESSIONS_FILE)
    _sessions = {k: WechatSession(**v) for k, v in data.items()}


def _save_session(token: str):
    session = _sessions.get(token)
    if session:
        save_item(SESSIONS_FILE, token, session.model_dump(mode="json"))


_load_sessions()


def _clean_expired():
    now = datetime.now(timezone.utc)
    expired = [t for t, s in _sessions.items() if now - s.created_at > timedelta(days=EXPIRE_DAYS)]
    for t in expired:
        del _sessions[t]
    if expired:
        save_data(SESSIONS_FILE, {k: v.model_dump(mode="json") for k, v in _sessions.items()})


_clean_expired()


def jscode2session(code: str) -> dict:
    """调用微信 jscode2session 接口获取 openid 和 session_key"""
    appid = settings.wechat_appid
    secret = settings.wechat_secret
    if not appid or not secret:
        raise ValueError("未配置微信 appid 或 secret")

    params = urlencode({
        "appid": appid,
        "secret": secret,
        "js_code": code,
        "grant_type": "authorization_code",
    })
    url = f"https://api.weixin.qq.com/sns/jscode2session?{params}"

    req = Request(url)
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())

    if "errcode" in data and data["errcode"] != 0:
        raise ValueError(f"微信登录失败: {data.get('errmsg', '未知错误')}")

    return data


def find_session_by_openid(openid: str) -> Optional[WechatSession]:
    for session in _sessions.values():
        if session.openid == openid:
            return session
    return None


def create_session(openid: str, account_id: str) -> WechatSession:
    token = str(uuid.uuid4())
    session = WechatSession(
        token=token,
        openid=openid,
        account_id=account_id,
        created_at=datetime.now(timezone.utc),
    )
    _sessions[token] = session
    _save_session(token)
    return session


def validate_token(token: str) -> Optional[str]:
    """校验 token，返回 account_id 或 None"""
    session = _sessions.get(token)
    if not session:
        return None
    if datetime.now(timezone.utc) - session.created_at > timedelta(days=EXPIRE_DAYS):
        del _sessions[token]
        return None
    return session.account_id


# ---- access token 缓存 ----
_access_token_cache = {"token": "", "expires_at": 0}


def get_access_token() -> str:
    """获取微信 access_token，自动缓存"""
    now = datetime.now(timezone.utc).timestamp()
    if _access_token_cache["token"] and _access_token_cache["expires_at"] > now + 60:
        return _access_token_cache["token"]

    appid = settings.wechat_appid
    secret = settings.wechat_secret
    if not appid or not secret:
        raise ValueError("未配置微信 appid 或 secret")

    params = urlencode({"grant_type": "client_credential", "appid": appid, "secret": secret})
    url = f"https://api.weixin.qq.com/cgi-bin/token?{params}"
    req = Request(url)
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())

    if "errcode" in data and data["errcode"] != 0:
        raise ValueError(f"获取 access_token 失败: {data.get('errmsg', '未知错误')}")

    _access_token_cache["token"] = data["access_token"]
    _access_token_cache["expires_at"] = now + data.get("expires_in", 7200)
    return data["access_token"]


def get_phone_number(code: str) -> str:
    """用微信 getPhoneNumber code 解密手机号"""
    access_token = get_access_token()
    url = f"https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token={access_token}"
    body = json.dumps({"code": code}).encode()
    req = Request(url, data=body, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())

    if data.get("errcode") != 0:
        raise ValueError(f"获取手机号失败: {data.get('errmsg', '未知错误')}")

    phone_info = data.get("phone_info", {})
    return phone_info.get("phoneNumber", "")
