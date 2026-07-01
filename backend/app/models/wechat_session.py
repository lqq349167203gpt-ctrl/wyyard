from app.models.base import SafeBaseModel
from datetime import datetime, timezone


class WechatSession(SafeBaseModel):
    token: str
    openid: str
    account_id: str
    created_at: datetime = datetime.now(timezone.utc)
