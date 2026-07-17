"""微信小程序会话（token）服务

读取每次直查 PostgreSQL，不使用进程内存缓存：
多实例/多进程部署时，import 时加载的内存快照会导致 token 互认失败/误踢。
写入保持同步落库（save_item / delete_item），过期删除同样写穿到 DB。
（模式比照 session_service.py）
"""
import uuid
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.request import urlopen, Request
from urllib.parse import urlencode

from app.models.wechat_session import WechatSession
from app.services.storage import delete_item, load_data, load_item, save_item
from app.config.settings import settings

logger = logging.getLogger(__name__)

SESSIONS_FILE = "wechat_sessions.json"

EXPIRE_DAYS = 30


def get_session(token: str) -> Optional[WechatSession]:
    """按 token 直查数据库，保证多实例下读取立即一致"""
    data = load_item(SESSIONS_FILE, token)
    return WechatSession(**data) if data else None


def save_session(session: WechatSession):
    """写穿到数据库（upsert 单条记录）"""
    save_item(SESSIONS_FILE, session.token, session.model_dump(mode="json"))


def delete_session(token: str):
    """删除单条会话，写穿到数据库"""
    delete_item(SESSIONS_FILE, token)


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
    # 每次直查数据库，保证其他实例写入的绑定关系立即可见
    data = load_data(SESSIONS_FILE) or {}
    for v in data.values():
        session = WechatSession(**v)
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
    save_session(session)
    return session


def validate_token(token: str) -> Optional[str]:
    """校验 token，返回 account_id 或 None"""
    session = get_session(token)
    if not session:
        return None
    if datetime.now(timezone.utc) - session.created_at > timedelta(days=EXPIRE_DAYS):
        # 过期删除写穿到 DB，避免多实例下旧 token 仍被其他实例认账
        delete_session(token)
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
